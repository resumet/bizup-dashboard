import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CourseOperationsInput } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedUser,
  type AuthenticatedUser,
} from "@/lib/supabase/auth";

export async function requireCourseOperationsMembership(userId: string) {
  const admin = createAdminClient();
  const configuredWorkspaceId =
    process.env.PRIMARY_WORKSPACE_ID?.trim() ||
    process.env.COURSE_INTAKE_WORKSPACE_ID?.trim();

  if (configuredWorkspaceId) {
    const { data: membership, error: membershipError } = await admin
      .from("workspace_members")
      .select("workspace_id,role")
      .eq("workspace_id", configuredWorkspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) {
      throw new Error(`공용 워크스페이스 조회 실패: ${membershipError.code}`);
    }
    if (membership) return membership;

    const { data: createdMembership, error: createError } = await admin
      .from("workspace_members")
      .insert({
        workspace_id: configuredWorkspaceId,
        user_id: userId,
        role: "operator",
      })
      .select("workspace_id,role")
      .single();
    if (createError) {
      throw new Error(`공용 워크스페이스 연결 실패: ${createError.code}`);
    }
    return createdMembership;
  }

  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id,role,workspaces!inner(is_primary)")
    .eq("user_id", userId)
    .eq("workspaces.is_primary", true)
    .maybeSingle();
  if (error) {
    throw new Error(
      /PGRST20[04]|42703/u.test(error.code)
        ? "공용 워크스페이스 DB 마이그레이션을 먼저 적용해 주세요."
        : `워크스페이스 조회 실패: ${error.code}`,
    );
  }
  if (!data) throw new Error("공용 워크스페이스 권한이 없습니다.");
  return { workspace_id: data.workspace_id, role: data.role };
}

export async function requireCourseOperationsUser(
  supabase: SupabaseClient,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(supabase);
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export async function assertLinkableItems(
  workspaceId: string,
  input: CourseOperationsInput,
  courseId: string | null,
) {
  const admin = createAdminClient();
  const [jobsResult, projectsResult, addressBookResult] = await Promise.all([
    input.rosterJobIds.length
      ? admin
          .from("course_jobs")
          .select("id,course_id")
          .eq("workspace_id", workspaceId)
          .in("id", input.rosterJobIds)
      : Promise.resolve({ data: [], error: null }),
    input.messageProjectIds.length
      ? admin
          .from("message_studio_projects")
          .select("id,course_id")
          .eq("workspace_id", workspaceId)
          .in("id", input.messageProjectIds)
      : Promise.resolve({ data: [], error: null }),
    input.freeAddressBookId
      ? admin
          .from("address_books")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("id", input.freeAddressBookId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (jobsResult.error || jobsResult.data.length !== input.rosterJobIds.length) {
    throw new Error("연결할 수강생 명단을 찾을 수 없습니다.");
  }
  if (
    projectsResult.error ||
    projectsResult.data.length !== input.messageProjectIds.length
  ) {
    throw new Error("연결할 문자 제작 프로젝트를 찾을 수 없습니다.");
  }
  if (
    input.freeAddressBookId &&
    (addressBookResult.error || !addressBookResult.data)
  ) {
    throw new Error("연결할 무료강의 수강생 주소록을 찾을 수 없습니다.");
  }
  if (jobsResult.data.some((item) => item.course_id && item.course_id !== courseId)) {
    throw new Error("이미 다른 강의에 연결된 수강생 명단이 포함되어 있습니다.");
  }
  if (
    projectsResult.data.some(
      (item) => item.course_id && item.course_id !== courseId,
    )
  ) {
    throw new Error("이미 다른 강의에 연결된 문자 제작 프로젝트가 포함되어 있습니다.");
  }
}

export async function replaceCourseChildren(
  courseId: string,
  input: CourseOperationsInput,
  {
    replaceOptions = true,
    replaceVideos = true,
  }: { replaceOptions?: boolean; replaceVideos?: boolean } = {},
) {
  const admin = createAdminClient();
  const [oldOptions, oldAppearances, oldLiveVideos] = await Promise.all([
    replaceOptions
      ? admin.from("course_options").select("id").eq("course_id", courseId)
      : Promise.resolve({ data: [], error: null }),
    replaceVideos
      ? admin
          .from("course_youtube_appearances")
          .select("id")
          .eq("course_id", courseId)
      : Promise.resolve({ data: [], error: null }),
    replaceVideos
      ? admin.from("course_live_videos").select("id").eq("course_id", courseId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (oldOptions.error || oldAppearances.error || oldLiveVideos.error) {
    const migrationMissing =
      oldLiveVideos.error?.code === "PGRST205" ||
      oldLiveVideos.error?.code === "42P01";
    throw new Error(
      migrationMissing
        ? "라이브 영상 링크 DB 마이그레이션을 먼저 적용해 주세요."
        : "기존 강의 세부 정보를 불러오지 못했습니다.",
    );
  }

  if (replaceOptions && input.options.length) {
    const { error: optionError } = await admin.from("course_options").insert(
      input.options.map((option, index) => ({
        course_id: courseId,
        name: option.name,
        list_price: option.listPrice,
        sale_price: option.salePrice,
        group_chat_link: option.groupChatLink,
        entry_code: option.entryCode,
        sort_order: index,
      })),
    );
    if (optionError) {
      throw new Error(
        optionError.code === "PGRST204"
          ? "옵션별 단톡방·입장코드 DB 마이그레이션을 먼저 적용해 주세요."
          : `강의 옵션 저장 실패: ${optionError.code}`,
      );
    }
  }

  if (replaceVideos && input.youtubeAppearances.length) {
    const { error } = await admin.from("course_youtube_appearances").insert(
      input.youtubeAppearances.map((appearance, index) => ({
        course_id: courseId,
        channel_name: appearance.channelName,
        channel_url: appearance.channelUrl,
        video_url: appearance.videoUrl,
        sort_order: index,
      })),
    );
    if (error) throw new Error(`유튜브 출연 정보 저장 실패: ${error.code}`);
  }

  if (replaceVideos && input.liveVideos.length) {
    const { error } = await admin.from("course_live_videos").insert(
      input.liveVideos.map((liveVideo, index) => ({
        course_id: courseId,
        name: liveVideo.name,
        video_url: liveVideo.videoUrl,
        note: liveVideo.note,
        sort_order: index,
      })),
    );
    if (error) throw new Error(`라이브 영상 링크 저장 실패: ${error.code}`);
  }

  const oldOptionIds = (oldOptions.data ?? []).map((item) => item.id);
  const oldAppearanceIds = (oldAppearances.data ?? []).map((item) => item.id);
  const oldLiveVideoIds = (oldLiveVideos.data ?? []).map((item) => item.id);
  await Promise.all([
    replaceOptions && oldOptionIds.length
      ? admin.from("course_options").delete().in("id", oldOptionIds)
      : Promise.resolve(),
    replaceVideos && oldAppearanceIds.length
      ? admin
          .from("course_youtube_appearances")
          .delete()
          .in("id", oldAppearanceIds)
      : Promise.resolve(),
    replaceVideos && oldLiveVideoIds.length
      ? admin.from("course_live_videos").delete().in("id", oldLiveVideoIds)
      : Promise.resolve(),
  ]);
}

export async function replaceCourseLinks(
  workspaceId: string,
  courseId: string,
  input: CourseOperationsInput,
) {
  const admin = createAdminClient();
  const [linkedJobs, linkedProjects] = await Promise.all([
    admin.from("course_jobs").select("id").eq("course_id", courseId),
    admin
      .from("message_studio_projects")
      .select("id")
      .eq("course_id", courseId),
  ]);
  if (linkedJobs.error || linkedProjects.error) {
    throw new Error("현재 연결 정보를 불러오지 못했습니다.");
  }

  const selectedJobs = new Set(input.rosterJobIds);
  const selectedProjects = new Set(input.messageProjectIds);
  const jobsToUnlink = (linkedJobs.data ?? [])
    .map((item) => item.id)
    .filter((id) => !selectedJobs.has(id));
  const projectsToUnlink = (linkedProjects.data ?? [])
    .map((item) => item.id)
    .filter((id) => !selectedProjects.has(id));

  const operations = [];
  if (jobsToUnlink.length) {
    operations.push(
      admin
        .from("course_jobs")
        .update({ course_id: null })
        .eq("workspace_id", workspaceId)
        .in("id", jobsToUnlink),
    );
  }
  if (projectsToUnlink.length) {
    operations.push(
      admin
        .from("message_studio_projects")
        .update({ course_id: null })
        .eq("workspace_id", workspaceId)
        .in("id", projectsToUnlink),
    );
  }
  if (input.rosterJobIds.length) {
    operations.push(
      admin
        .from("course_jobs")
        .update({ course_id: courseId })
        .eq("workspace_id", workspaceId)
        .in("id", input.rosterJobIds),
    );
  }
  if (input.messageProjectIds.length) {
    operations.push(
      admin
        .from("message_studio_projects")
        .update({ course_id: courseId })
        .eq("workspace_id", workspaceId)
        .in("id", input.messageProjectIds),
    );
  }

  const results = await Promise.all(operations);
  if (results.some((result) => result.error)) {
    throw new Error("수강생 명단 또는 문자 제작 프로젝트 연결에 실패했습니다.");
  }
}

export function courseOperationsApiError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "강의 정보를 처리하지 못했습니다.";
  if (message === "UNAUTHORIZED") {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }
  if (message === "NOT_FOUND") {
    return Response.json({ message: "강의를 찾을 수 없습니다." }, { status: 404 });
  }
  return Response.json(
    {
      message: /PGRST20[45]|42703/u.test(message)
        ? "강의 운영 DB 마이그레이션을 먼저 적용해 주세요."
        : message,
    },
    { status: 400 },
  );
}
