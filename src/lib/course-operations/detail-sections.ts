import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AddressBookSummary,
  CourseMessageContentData,
  CourseMessagesSectionData,
  CourseRosterAnalysis,
  CourseSalesSectionData,
  CourseStudentPreview,
  CourseStudentsSectionData,
  CourseVideosSectionData,
  FreeStudentPreview,
  LinkableMessageProject,
  LinkableRosterJob,
} from "@/lib/course-operations/types";
import {
  buildYoutubeChannelSuggestions,
  decodeReadableUrl,
} from "@/lib/course-operations/youtube-channels";
import {
  analyzeRosterOptions,
  analyzeRosterSources,
  countGroupChatParticipants,
} from "@/lib/jobs/filter";

const ANALYSIS_PAGE_SIZE = 1_000;
const ANALYSIS_CONCURRENCY = 5;

export async function loadSalesSection(
  supabase: SupabaseClient,
  courseId: string,
): Promise<CourseSalesSectionData> {
  const [courseResult, optionsResult] = await Promise.all([
    supabase
      .from("courses")
      .select("early_bird_event,first_50_event")
      .eq("id", courseId)
      .maybeSingle(),
    supabase
      .from("course_options")
      .select("name,list_price,sale_price,group_chat_link,entry_code")
      .eq("course_id", courseId)
      .order("sort_order"),
  ]);
  if (courseResult.error) throw new Error(courseResult.error.message);
  if (!courseResult.data) throw new Error("NOT_FOUND");
  if (optionsResult.error) throw new Error(optionsResult.error.message);

  return {
    earlyBirdEvent: courseResult.data.early_bird_event ?? "",
    first50Event: courseResult.data.first_50_event ?? "",
    options: (optionsResult.data ?? []).map((option) => ({
      name: option.name,
      listPrice: String(option.list_price),
      salePrice: String(option.sale_price),
      groupChatLink: option.group_chat_link ?? "",
      entryCode: option.entry_code ?? "",
    })),
  };
}

async function loadCourseRosterAnalysis(
  supabase: SupabaseClient,
  job: LinkableRosterJob,
): Promise<CourseRosterAnalysis> {
  const firstPage = await supabase
    .from("job_enrollments")
    .select("normalized_values", { count: "exact" })
    .eq("job_id", job.id)
    .eq("version", job.latest_version)
    .order("source_row_number")
    .range(0, ANALYSIS_PAGE_SIZE - 1);
  if (firstPage.error) throw new Error(firstPage.error.message);

  const rows = [...(firstPage.data ?? [])];
  const totalCount = firstPage.count ?? rows.length;
  const remainingStarts = Array.from(
    { length: Math.max(0, Math.ceil(totalCount / ANALYSIS_PAGE_SIZE) - 1) },
    (_, index) => (index + 1) * ANALYSIS_PAGE_SIZE,
  );

  for (
    let offset = 0;
    offset < remainingStarts.length;
    offset += ANALYSIS_CONCURRENCY
  ) {
    const batch = await Promise.all(
      remainingStarts
        .slice(offset, offset + ANALYSIS_CONCURRENCY)
        .map((start) =>
          supabase
            .from("job_enrollments")
            .select("normalized_values")
            .eq("job_id", job.id)
            .eq("version", job.latest_version)
            .order("source_row_number")
            .range(start, start + ANALYSIS_PAGE_SIZE - 1),
        ),
    );
    const failed = batch.find((result) => result.error);
    if (failed?.error) throw new Error(failed.error.message);
    rows.push(...batch.flatMap((result) => result.data ?? []));
  }

  const analysisRows = rows.map((row) => {
    const values = (row.normalized_values ?? {}) as Record<string, unknown>;
    return {
      values: {
        source: typeof values.source === "string" ? values.source : "",
        optionName:
          typeof values.optionName === "string" ? values.optionName : "",
      },
      groupChatJoined: values.groupChatJoined === true,
    };
  });

  return {
    sourceJobId: job.id,
    totalCount: analysisRows.length,
    groupChatJoinedCount: countGroupChatParticipants(analysisRows),
    sourceItems: analyzeRosterSources(analysisRows),
    optionItems: analyzeRosterOptions(analysisRows),
  };
}

export async function loadStudentsSection(
  supabase: SupabaseClient,
  courseId: string,
  freeAddressBookId: string,
): Promise<CourseStudentsSectionData> {
  const [jobsResult, addressBooksResult] = await Promise.all([
    supabase
      .from("course_jobs")
      .select("id,name,default_course_name,valid_count,course_id,latest_version")
      .or(`course_id.is.null,course_id.eq.${courseId}`)
      .order("updated_at", { ascending: false }),
    supabase
      .from("address_books")
      .select("id,name,contact_count,updated_at")
      .order("updated_at", { ascending: false }),
  ]);
  if (jobsResult.error) throw new Error(jobsResult.error.message);
  if (addressBooksResult.error) throw new Error(addressBooksResult.error.message);

  const rosterJobs = (jobsResult.data ?? []) as LinkableRosterJob[];
  const linkedJob = rosterJobs.find((job) => job.course_id === courseId);
  const [paidPreviewResult, paidRosterAnalysis, freePreviewResult] =
    await Promise.all([
      linkedJob
        ? supabase
            .from("job_enrollments")
            .select("id,normalized_phone,normalized_values")
            .eq("job_id", linkedJob.id)
            .eq("version", linkedJob.latest_version)
            .order("source_row_number")
            .limit(20)
        : Promise.resolve({ data: [], error: null }),
      linkedJob
        ? loadCourseRosterAnalysis(supabase, linkedJob)
        : Promise.resolve(undefined),
      freeAddressBookId
        ? supabase
            .from("address_book_contacts")
            .select("id,name,normalized_phone,email")
            .eq("address_book_id", freeAddressBookId)
            .order("name")
            .limit(20)
        : Promise.resolve({ data: [], error: null }),
    ]);
  if (paidPreviewResult.error) throw new Error(paidPreviewResult.error.message);
  if (freePreviewResult.error) throw new Error(freePreviewResult.error.message);

  const paidStudentPreview: CourseStudentPreview[] = linkedJob
    ? (paidPreviewResult.data ?? []).map((row) => {
        const values = row.normalized_values as Record<string, unknown>;
        return {
          id: row.id,
          name:
            typeof values.customerName === "string" ? values.customerName : "",
          phone: row.normalized_phone ?? "",
          email: typeof values.email === "string" ? values.email : "",
          memo: typeof values.memo === "string" ? values.memo : "",
          sourceJobId: linkedJob.id,
        };
      })
    : [];
  const freeStudentPreview: FreeStudentPreview[] = (
    freePreviewResult.data ?? []
  ).map((contact) => ({
    id: contact.id,
    name: contact.name ?? "",
    phone: contact.normalized_phone,
    email: contact.email ?? "",
    sourceAddressBookId: freeAddressBookId,
  }));

  return {
    rosterJobs,
    addressBooks: (addressBooksResult.data ?? []) as AddressBookSummary[],
    paidStudentPreview,
    paidRosterAnalysis,
    freeStudentPreview,
  };
}

export async function loadMessagesSection(
  supabase: SupabaseClient,
  courseId: string,
  selectedProjectId: string,
): Promise<CourseMessagesSectionData> {
  const { data, error } = await supabase
    .from("message_studio_projects")
    .select("id,course_name,instructor_name,updated_at,course_id")
    .or(`course_id.is.null,course_id.eq.${courseId}`)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);

  const projects = data ?? [];
  const projectIds = projects.map((project) => project.id);
  const loadSelectedProject = projectIds.includes(selectedProjectId);
  const [generatedResourcesResult, selectedResourcesResult] = await Promise.all([
    projectIds.length
      ? supabase
          .from("message_studio_resources")
          .select("project_id,position")
          .in("project_id", projectIds)
          .neq("generated_text", "")
      : Promise.resolve({ data: [], error: null }),
    loadSelectedProject
      ? supabase
          .from("message_studio_resources")
          .select("position,generated_text")
          .eq("project_id", selectedProjectId)
          .neq("generated_text", "")
          .order("position")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (generatedResourcesResult.error) {
    throw new Error(generatedResourcesResult.error.message);
  }
  if (selectedResourcesResult.error) {
    throw new Error(selectedResourcesResult.error.message);
  }

  const generatedCounts = new Map<string, number>();
  for (const resource of generatedResourcesResult.data ?? []) {
    generatedCounts.set(
      resource.project_id,
      (generatedCounts.get(resource.project_id) ?? 0) + 1,
    );
  }

  return {
    messageProjects: projects.map((project) => ({
      ...project,
      generated_count: generatedCounts.get(project.id) ?? 0,
      resources_loaded: project.id === selectedProjectId,
      message_studio_resources:
        project.id === selectedProjectId ? selectedResourcesResult.data ?? [] : [],
    })) as LinkableMessageProject[],
  };
}

export async function loadMessageContent(
  supabase: SupabaseClient,
  courseId: string,
  projectId: string,
): Promise<CourseMessageContentData> {
  const { data: project, error: projectError } = await supabase
    .from("message_studio_projects")
    .select("id")
    .eq("id", projectId)
    .or(`course_id.is.null,course_id.eq.${courseId}`)
    .maybeSingle();
  if (projectError) throw new Error(projectError.message);
  if (!project) throw new Error("NOT_FOUND");

  const { data, error } = await supabase
    .from("message_studio_resources")
    .select("position,generated_text")
    .eq("project_id", projectId)
    .neq("generated_text", "")
    .order("position");
  if (error) throw new Error(error.message);
  return { projectId, resources: data ?? [] };
}

export async function loadVideosSection(
  supabase: SupabaseClient,
  courseId: string,
): Promise<CourseVideosSectionData> {
  const [suggestionsResult, appearancesResult, liveVideosResult] =
    await Promise.all([
      supabase
        .from("course_youtube_appearances")
        .select("channel_name,channel_url,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("course_youtube_appearances")
        .select("channel_name,channel_url,video_url")
        .eq("course_id", courseId)
        .order("sort_order"),
      supabase
        .from("course_live_videos")
        .select("name,video_url,note")
        .eq("course_id", courseId)
        .order("sort_order"),
    ]);
  if (suggestionsResult.error) throw new Error(suggestionsResult.error.message);
  if (appearancesResult.error) throw new Error(appearancesResult.error.message);
  if (liveVideosResult.error) throw new Error(liveVideosResult.error.message);

  return {
    youtubeChannelSuggestions: buildYoutubeChannelSuggestions(
      suggestionsResult.data ?? [],
    ),
    youtubeAppearances: (appearancesResult.data ?? []).map((appearance) => ({
      channelName: appearance.channel_name,
      channelUrl: decodeReadableUrl(appearance.channel_url),
      videoUrl: appearance.video_url,
    })),
    liveVideos: (liveVideosResult.data ?? []).map((liveVideo) => ({
      name: liveVideo.name,
      videoUrl: liveVideo.video_url,
      note: liveVideo.note,
    })),
  };
}
