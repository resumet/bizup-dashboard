import { hasAdminAccess } from "@/lib/admin/access";
import {
  assertLinkableItems,
  courseOperationsApiError,
  replaceCourseChildren,
  replaceCourseLinks,
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import {
  loadMessagesSection,
  loadMessageContent,
  loadSalesSection,
  loadStudentsSection,
  loadVideosSection,
} from "@/lib/course-operations/detail-sections";
import { parseCourseOperationsInput } from "@/lib/course-operations/validation";
import { invalidateCourseOperationsList } from "@/lib/course-operations/list-cache";
import {
  readCourseOperationsRequest,
  removeCourseBanner,
  uploadCourseBanner,
} from "@/lib/course-operations/banner-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type DetailSection =
  | "sales"
  | "students"
  | "messages"
  | "message-content"
  | "videos";

function isDetailSection(value: string | null): value is DetailSection {
  return (
    value === "sales" ||
    value === "students" ||
    value === "messages" ||
    value === "message-content" ||
    value === "videos"
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const startedAt = performance.now();
  const supabase = await createClient();
  let section = "unknown";
  try {
    const selectedSection = new URL(request.url).searchParams.get("section");
    if (!isDetailSection(selectedSection)) {
      return Response.json(
        { message: "불러올 상세 영역이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    section = selectedSection;
    const messageProjectId =
      new URL(request.url).searchParams.get("messageProjectId") ?? "";
    if (
      messageProjectId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        messageProjectId,
      )
    ) {
      return Response.json({ message: "문자 프로젝트 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const user = await requireCourseOperationsUser(supabase);
    const [{ courseId }, membership] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
    ]);
    const admin = createAdminClient();
    const { data: course, error } = await admin
      .from("courses")
      .select("id,free_address_book_id")
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id)
      .maybeSingle();
    if (error) throw new Error(`강의 조회 실패: ${error.code}`);
    if (!course) throw new Error("NOT_FOUND");

    const data =
      selectedSection === "sales"
        ? await loadSalesSection(supabase, courseId)
        : selectedSection === "students"
        ? await loadStudentsSection(
            supabase,
            courseId,
            course.free_address_book_id ?? "",
          )
        : selectedSection === "messages"
          ? await loadMessagesSection(supabase, courseId, messageProjectId)
          : selectedSection === "message-content" && messageProjectId
            ? await loadMessageContent(supabase, courseId, messageProjectId)
            : selectedSection === "videos"
              ? await loadVideosSection(supabase, courseId)
              : (() => {
                  throw new Error("문자 프로젝트를 선택해 주세요.");
                })();
    const durationMs = performance.now() - startedAt;

    console.info(
      JSON.stringify({
        event: "course_detail_section",
        courseId,
        section: selectedSection,
        durationMs: Math.round(durationMs),
      }),
    );
    return Response.json(data, {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `course-section;dur=${durationMs.toFixed(1)}`,
      },
    });
  } catch (error) {
    const response = courseOperationsApiError(error);
    response.headers.set(
      "Server-Timing",
      `course-section;dur=${(performance.now() - startedAt).toFixed(1)};desc=${section}`,
    );
    return response;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const supabase = await createClient();
  let uncommittedBannerPath = "";
  try {
    const user = await requireCourseOperationsUser(supabase);
    const [{ courseId }, membership, requestData] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
      readCourseOperationsRequest(request),
    ]);
    const { body, banner } = requestData;
    const input = parseCourseOperationsInput(body);
    const loadedDetailSections =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).loadedDetailSections
        : undefined;
    const replaceVideos = !(
      typeof loadedDetailSections === "object" &&
      loadedDetailSections !== null &&
      (loadedDetailSections as Record<string, unknown>).videos === false
    );
    const replaceSales = !(
      typeof loadedDetailSections === "object" &&
      loadedDetailSections !== null &&
      (loadedDetailSections as Record<string, unknown>).sales === false
    );
    const admin = createAdminClient();
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id,banner_image_path")
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id)
      .maybeSingle();
    if (courseError) throw new Error(`강의 조회 실패: ${courseError.code}`);
    if (!course) throw new Error("NOT_FOUND");

    if (banner.file) {
      uncommittedBannerPath = await uploadCourseBanner(
        admin,
        membership.workspace_id,
        courseId,
        banner.file,
      );
    }
    const nextBannerPath = uncommittedBannerPath ||
      (banner.remove ? "" : course.banner_image_path ?? "");

    await assertLinkableItems(membership.workspace_id, input, courseId);
    await replaceCourseChildren(courseId, input, {
      replaceOptions: replaceSales,
      replaceVideos,
    });

    const { error } = await admin
      .from("courses")
      .update({
        name: input.name,
        instructor_name: input.instructorName,
        free_webinar_at: input.freeWebinarAt,
        starts_at: input.startsAt,
        ...(replaceSales
          ? {
              early_bird_event: input.earlyBirdEvent,
              first_50_event: input.first50Event,
              course_differentiation: input.courseDifferentiation,
            }
          : {}),
        landing_page_link: input.landingPageLink,
        free_kakao_room_1_link: input.freeKakaoRoom1Link,
        free_kakao_room_2_link: input.freeKakaoRoom2Link,
        ...(typeof body === "object" && body !== null && "paidKakaoRoomLink" in body
          ? { paid_kakao_room_link: input.paidKakaoRoomLink }
          : {}),
        communication_room_link: input.communicationRoomLink,
        payment_link: input.paymentLink,
        inquiry_link: input.inquiryLink,
        curriculum_link: input.curriculumLink,
        free_gift_link: input.freeGiftLink,
        course_viewing_link: input.courseViewingLink,
        course_materials_link: input.courseMaterialsLink,
        custom_links: input.customLinks,
        free_address_book_id: input.freeAddressBookId || null,
        required_tasks: input.requiredTasks,
        banner_image_path: nextBannerPath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id);
    if (error) throw new Error(`강의 저장 실패: ${error.code}`);

    const previousBannerPath = course.banner_image_path ?? "";
    if (previousBannerPath && previousBannerPath !== nextBannerPath) {
      await removeCourseBanner(admin, previousBannerPath);
    }
    uncommittedBannerPath = "";

    await replaceCourseLinks(membership.workspace_id, courseId, input);
    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "course_operations.course_saved",
      entity_type: "course",
      entity_id: courseId,
      metadata: { name: input.name },
    });
    invalidateCourseOperationsList();
    return Response.json({ id: courseId });
  } catch (error) {
    if (uncommittedBannerPath) {
      await removeCourseBanner(createAdminClient(), uncommittedBannerPath);
    }
    return courseOperationsApiError(error);
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const supabase = await createClient();
  try {
    const user = await requireCourseOperationsUser(supabase);
    const [{ courseId }, membership] = await Promise.all([
      params,
      requireCourseOperationsMembership(user.id),
    ]);
    if (!hasAdminAccess(user.email, membership.role)) {
      return Response.json(
        { message: "관리자만 강의를 삭제할 수 있습니다." },
        { status: 403 },
      );
    }
    const admin = createAdminClient();
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id,name,banner_image_path")
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id)
      .maybeSingle();
    if (courseError) throw new Error(`강의 조회 실패: ${courseError.code}`);
    if (!course) throw new Error("NOT_FOUND");

    const { error: deleteError } = await admin
      .from("courses")
      .delete()
      .eq("id", courseId)
      .eq("workspace_id", membership.workspace_id);
    if (deleteError) throw new Error(`강의 삭제 실패: ${deleteError.code}`);

    if (course.banner_image_path) {
      await removeCourseBanner(admin, course.banner_image_path);
    }

    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "course_operations.course_deleted",
      entity_type: "course",
      entity_id: courseId,
      metadata: { name: course.name },
    });
    invalidateCourseOperationsList();
    return Response.json({ message: "강의가 삭제되었습니다." });
  } catch (error) {
    return courseOperationsApiError(error);
  }
}
