import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CourseOperationsEditor } from "@/components/course-operations/course-editor";
import { Button } from "@/components/ui/button";
import type {
  CourseOperationsDraft,
  LinkableMessageProject,
  LinkableRosterJob,
} from "@/lib/course-operations/types";
import { buildYoutubeChannelSuggestions } from "@/lib/course-operations/youtube-channels";
import { createDefaultRequiredTasks } from "@/lib/course-operations/required-tasks";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const EMPTY_DRAFT: CourseOperationsDraft = {
  name: "",
  instructorName: "",
  freeWebinarAt: "",
  startsAt: "",
  earlyBirdEvent: "",
  first50Event: "",
  freeKakaoRoom1Link: "",
  freeKakaoRoom2Link: "",
  communicationRoomLink: "",
  paymentLink: "",
  inquiryLink: "",
  curriculumLink: "",
  freeGiftLink: "",
  courseViewingLink: "",
  courseMaterialsLink: "",
  options: [{
    name: "",
    listPrice: "",
    salePrice: "",
    groupChatLink: "",
    entryCode: "",
  }],
  youtubeAppearances: [],
  rosterJobIds: [],
  messageProjectIds: [],
  freeAddressBookId: "",
  requiredTasks: createDefaultRequiredTasks(),
};

export default async function NewCourseOperationsPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const [jobsResult, projectsResult, youtubeChannelsResult] = await Promise.all([
    supabase
      .from("course_jobs")
      .select("id,name,default_course_name,valid_count,course_id,latest_version")
      .is("course_id", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("message_studio_projects")
      .select(
        "id,course_name,instructor_name,updated_at,course_id,message_studio_resources(generated_text)",
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
            <Link href="/services/course-operations">
              <ArrowLeft />강의 목록
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">새 강의 만들기</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        <CourseOperationsEditor
          initialDraft={EMPTY_DRAFT}
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
