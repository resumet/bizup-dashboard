import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CourseOperationsEditor } from "@/components/course-operations/course-editor";
import { Button } from "@/components/ui/button";
import type {
  AddressBookSummary,
  CourseRosterAnalysis,
  CourseStudentPreview,
  CourseOperationsDraft,
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
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ courseId: string }> };

const ANALYSIS_PAGE_SIZE = 1_000;
const ANALYSIS_CONCURRENCY = 5;

async function loadCourseRosterAnalysis(
  supabase: Awaited<ReturnType<typeof createClient>>,
  job: LinkableRosterJob,
): Promise<{ data?: CourseRosterAnalysis; error?: string }> {
  const firstPage = await supabase
    .from("job_enrollments")
    .select("normalized_values", { count: "exact" })
    .eq("job_id", job.id)
    .eq("version", job.latest_version)
    .order("source_row_number")
    .range(0, ANALYSIS_PAGE_SIZE - 1);
  if (firstPage.error) return { error: firstPage.error.message };

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
    if (failed?.error) return { error: failed.error.message };
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
    data: {
      sourceJobId: job.id,
      totalCount: analysisRows.length,
      groupChatJoinedCount: countGroupChatParticipants(analysisRows),
      sourceItems: analyzeRosterSources(analysisRows),
      optionItems: analyzeRosterOptions(analysisRows),
    },
  };
}

export default async function CourseOperationsDetailPage({ params }: Props) {
  const { courseId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select(
      "id,name,instructor_name,free_webinar_at,starts_at,early_bird_event,first_50_event,free_kakao_room_1_link,free_kakao_room_2_link,communication_room_link,payment_link,inquiry_link,curriculum_link,free_gift_link,course_viewing_link,free_address_book_id",
    )
    .eq("id", courseId)
    .maybeSingle();
  if (courseError) {
    throw new Error(
      courseError.code === "PGRST204"
        ? "무료강의 주소록 연결 DB 마이그레이션을 먼저 적용해 주세요."
        : `강의 조회 실패: ${courseError.code}`,
    );
  }
  if (!course) notFound();

  const [
    optionsResult,
    appearancesResult,
    jobsResult,
    projectsResult,
    addressBooksResult,
    youtubeChannelsResult,
  ] =
    await Promise.all([
      supabase
        .from("course_options")
        .select("*")
        .eq("course_id", courseId)
        .order("sort_order"),
      supabase
        .from("course_youtube_appearances")
        .select("id,channel_name,channel_url,video_url")
        .eq("course_id", courseId)
        .order("sort_order"),
      supabase
        .from("course_jobs")
        .select("id,name,default_course_name,valid_count,course_id,latest_version")
        .or(`course_id.is.null,course_id.eq.${courseId}`)
        .order("updated_at", { ascending: false }),
      supabase
        .from("message_studio_projects")
        .select(
          "id,course_name,instructor_name,updated_at,course_id,message_studio_resources(generated_text)",
        )
        .or(`course_id.is.null,course_id.eq.${courseId}`)
        .order("updated_at", { ascending: false }),
      supabase
        .from("address_books")
        .select("id,name,contact_count,updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("course_youtube_appearances")
        .select("channel_name,channel_url,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  const loadError =
    optionsResult.error?.message ||
    appearancesResult.error?.message ||
    jobsResult.error?.message ||
    projectsResult.error?.message ||
    addressBooksResult.error?.message ||
    youtubeChannelsResult.error?.message;
  const linkedJobs = (jobsResult.data ?? []).filter(
    (job) => job.course_id === courseId,
  );
  const linkedJob = linkedJobs[0] as LinkableRosterJob | undefined;
  const [paidPreviewResult, paidRosterAnalysisResult, freePreviewResult] =
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
        : Promise.resolve({ data: undefined, error: undefined }),
      course.free_address_book_id
        ? supabase
            .from("address_book_contacts")
            .select("id,name,normalized_phone,email")
            .eq("address_book_id", course.free_address_book_id)
            .order("name")
            .limit(20)
        : Promise.resolve({ data: [], error: null }),
    ]);
  const previewError =
    paidPreviewResult.error?.message ||
    paidRosterAnalysisResult.error ||
    freePreviewResult.error?.message;
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
    sourceAddressBookId: course.free_address_book_id ?? "",
  }));
  const draft: CourseOperationsDraft = {
    name: course.name,
    instructorName: course.instructor_name,
    freeWebinarAt: course.free_webinar_at,
    startsAt: course.starts_at,
    earlyBirdEvent: course.early_bird_event,
    first50Event: course.first_50_event,
    freeKakaoRoom1Link: course.free_kakao_room_1_link,
    freeKakaoRoom2Link: course.free_kakao_room_2_link,
    communicationRoomLink: course.communication_room_link,
    paymentLink: course.payment_link,
    inquiryLink: course.inquiry_link,
    curriculumLink: course.curriculum_link,
    freeGiftLink: course.free_gift_link,
    courseViewingLink: course.course_viewing_link,
    options: (optionsResult.data ?? []).map((option) => ({
      name: option.name,
      listPrice: String(option.list_price),
      salePrice: String(option.sale_price),
      groupChatLink: option.group_chat_link ?? "",
      entryCode: option.entry_code ?? "",
    })),
    youtubeAppearances: (appearancesResult.data ?? []).map((appearance) => ({
      channelName: appearance.channel_name,
      channelUrl: decodeReadableUrl(appearance.channel_url),
      videoUrl: appearance.video_url,
    })),
    rosterJobIds: linkedJobs.slice(0, 1).map((job) => job.id),
    messageProjectIds: (projectsResult.data ?? [])
      .filter((project) => project.course_id === courseId)
      .map((project) => project.id),
    freeAddressBookId: course.free_address_book_id ?? "",
  };

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/services/course-operations">
              <ArrowLeft />강의 목록
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="truncate font-semibold">{course.name}</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        <CourseOperationsEditor
          courseId={courseId}
          initialDraft={draft}
          rosterJobs={(jobsResult.data ?? []) as LinkableRosterJob[]}
          messageProjects={(projectsResult.data ?? []) as LinkableMessageProject[]}
          addressBooks={(addressBooksResult.data ?? []) as AddressBookSummary[]}
          youtubeChannelSuggestions={buildYoutubeChannelSuggestions(
            youtubeChannelsResult.data ?? [],
          )}
          paidStudentPreview={paidStudentPreview}
          paidRosterAnalysis={paidRosterAnalysisResult.data}
          freeStudentPreview={freeStudentPreview}
          loadError={loadError || previewError}
        />
      </div>
    </main>
  );
}
