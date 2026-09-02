import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CourseOperationsEditor } from "@/components/course-operations/course-editor";
import { PendingLinkLabel } from "@/components/navigation/pending-link-label";
import { Button } from "@/components/ui/button";
import { toCourseNote, type CourseNote } from "@/lib/course-operations/notes";
import type { CourseOperationsDraft } from "@/lib/course-operations/types";
import { normalizeRequiredTasks } from "@/lib/course-operations/required-tasks";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function CourseOperationsDetailPage({ params, searchParams }: Props) {
  const renderStartedAt = performance.now();
  const { courseId } = await params;
  const { tab } = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  await requireCourseOperationsMembership(user.id);

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select(
      "id,name,instructor_name,free_webinar_at,starts_at,landing_page_link,free_kakao_room_1_link,free_kakao_room_2_link,communication_room_link,payment_link,inquiry_link,curriculum_link,free_gift_link,course_viewing_link,course_materials_link,custom_links,free_address_book_id,required_tasks",
    )
    .eq("id", courseId)
    .maybeSingle();
  if (courseError) {
    throw new Error(
      courseError.code === "PGRST204"
        ? "강의 운영 DB 마이그레이션을 먼저 적용해 주세요."
        : `강의 조회 실패: ${courseError.code}`,
    );
  }
  if (!course) notFound();

  const [
    linkedJobsResult,
    linkedProjectsResult,
    notesResult,
  ] =
    await Promise.all([
      supabase
        .from("course_jobs")
        .select("id")
        .eq("course_id", courseId)
        .limit(1),
      supabase
        .from("message_studio_projects")
        .select("id")
        .eq("course_id", courseId)
        .limit(1),
      supabase
        .from("course_notes")
        .select("id,content,created_by,author_email,created_at,updated_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false }),
    ]);

  const loadError =
    linkedJobsResult.error?.message ||
    linkedProjectsResult.error?.message;
  const notes: CourseNote[] = (notesResult.data ?? []).map(toCourseNote);
  const notesLoadError = notesResult.error
    ? notesResult.error.code === "PGRST205" || notesResult.error.code === "42P01"
      ? "강의 메모 DB 마이그레이션을 먼저 적용해 주세요."
      : notesResult.error.message
    : undefined;
  const draft: CourseOperationsDraft = {
    name: course.name,
    instructorName: course.instructor_name,
    freeWebinarAt: course.free_webinar_at,
    startsAt: course.starts_at,
    earlyBirdEvent: "",
    first50Event: "",
    landingPageLink: course.landing_page_link,
    freeKakaoRoom1Link: course.free_kakao_room_1_link,
    freeKakaoRoom2Link: course.free_kakao_room_2_link,
    communicationRoomLink: course.communication_room_link,
    paymentLink: course.payment_link,
    inquiryLink: course.inquiry_link,
    curriculumLink: course.curriculum_link,
    freeGiftLink: course.free_gift_link,
    courseViewingLink: course.course_viewing_link,
    courseMaterialsLink: course.course_materials_link,
    customLinks: Array.isArray(course.custom_links)
      ? course.custom_links.flatMap((item) => {
          if (typeof item !== "object" || item === null) return [];
          const link = item as Record<string, unknown>;
          return typeof link.name === "string" && typeof link.url === "string"
            ? [{ name: link.name, url: link.url }]
            : [];
        })
      : [],
    options: [],
    youtubeAppearances: [],
    liveVideos: [],
    rosterJobIds: (linkedJobsResult.data ?? []).map((job) => job.id),
    messageProjectIds: (linkedProjectsResult.data ?? []).map(
      (project) => project.id,
    ),
    freeAddressBookId: course.free_address_book_id ?? "",
    requiredTasks: normalizeRequiredTasks(course.required_tasks),
  };

  console.info(
    JSON.stringify({
      event: "course_detail_render",
      courseId,
      durationMs: Math.round(performance.now() - renderStartedAt),
      initialQueries: 4,
    }),
  );

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/services/course-operations">
              <PendingLinkLabel
                idle={
                  <>
                    <ArrowLeft />강의 목록
                  </>
                }
                pending="이동 중"
              />
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
          deferDetailSections
          currentUserId={user.id}
          currentUserEmail={user.email ?? "이메일 정보 없음"}
          initialNotes={notes}
          notesLoadError={notesLoadError}
          loadError={loadError}
          initialTab={tab === "settlement" ? "settlement" : "information"}
        />
      </div>
    </main>
  );
}
