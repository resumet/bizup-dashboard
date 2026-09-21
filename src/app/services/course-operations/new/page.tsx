import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CourseOperationsEditor } from "@/components/course-operations/course-editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type {
  CourseOperationsDraft,
  LinkableMessageProject,
  LinkableRosterJob,
} from "@/lib/course-operations/types";
import { buildYoutubeChannelSuggestions } from "@/lib/course-operations/youtube-channels";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { createDefaultRequiredTasks } from "@/lib/course-operations/required-tasks";
import { loadCourseScheduleDraft } from "@/lib/course-schedule-planner/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const EMPTY_DRAFT: CourseOperationsDraft = {
  name: "",
  instructorName: "",
  cohort: "",
  freeWebinarAt: "",
  startsAt: "",
  earlyBirdEvent: "",
  first50Event: "",
  courseDifferentiation: "",
  landingPageLink: "",
  freeKakaoRoom1Link: "",
  freeKakaoRoom2Link: "",
  paidKakaoRoomLink: "",
  communicationRoomLink: "",
  paymentLink: "",
  inquiryLink: "https://m.site.naver.com/281dJ",
  curriculumLink: "",
  freeGiftLink: "",
  courseViewingLink: "",
  courseMaterialsLink: "",
  customLinks: [],
  options: [],
  youtubeAppearances: [],
  liveVideos: [],
  rosterJobIds: [],
  messageProjectIds: [],
  freeAddressBookId: "",
  requiredTasks: createDefaultRequiredTasks(),
};

type Props = {
  searchParams: Promise<{ draftId?: string }>;
};

export default async function NewCourseOperationsPage({ searchParams }: Props) {
  const { draftId = "" } = await searchParams;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);

  const scheduleDraft = draftId
    ? await loadCourseScheduleDraft(membership.workspace_id, draftId)
    : null;
  if (draftId && !scheduleDraft) notFound();
  const initialDraft: CourseOperationsDraft = scheduleDraft
    ? {
        ...EMPTY_DRAFT,
        name: scheduleDraft.topic,
        instructorName: scheduleDraft.instructorName,
        freeWebinarAt: scheduleDraft.scheduledDate ?? "",
      }
    : EMPTY_DRAFT;

  const [jobsResult, projectsResult, youtubeChannelsResult] = await Promise.all([
    supabase
      .from("course_jobs")
      .select("id,name,default_course_name,valid_count,course_id,latest_version")
      .is("course_id", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("message_studio_projects")
      .select(
        "id,course_name,instructor_name,updated_at,course_id,message_studio_resources(position,generated_text)",
      )
      .is("course_id", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("course_youtube_appearances")
      .select("channel_name,channel_url,created_at")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const loadError =
    jobsResult.error?.message ||
    projectsResult.error?.message ||
    youtubeChannelsResult.error?.message;

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href={scheduleDraft ? "/services/course-schedule-planner" : "/services/course-operations"}>
              <ArrowLeft />{scheduleDraft ? "일정 플래너" : "강의 목록"}
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">
            {scheduleDraft ? "예비 강의를 정규 강의로 만들기" : "새 강의 만들기"}
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        {scheduleDraft ? (
          <Alert className="mb-6 border-sky-300 bg-sky-50 text-sky-950">
            <AlertTitle>예비 강의 정보를 불러왔습니다</AlertTitle>
            <AlertDescription>
              정규 강의 생성이 완료되면 예비 강의 카드는 정리되고,
              저장된 메모가 있으면 새 강의의 강의 메모에 자동으로 추가됩니다.
            </AlertDescription>
          </Alert>
        ) : null}
        <CourseOperationsEditor
          initialDraft={initialDraft}
          sourceScheduleDraftId={scheduleDraft?.id}
          rosterJobs={(jobsResult.data ?? []) as LinkableRosterJob[]}
          messageProjects={(projectsResult.data ?? []) as LinkableMessageProject[]}
          addressBooks={[]}
          youtubeChannelSuggestions={buildYoutubeChannelSuggestions(
            youtubeChannelsResult.data ?? [],
          )}
          loadError={loadError}
        />
      </div>
    </main>
  );
}
