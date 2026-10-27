import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { InstagramManagementWorkspace } from "@/components/course-documents/instagram-management-workspace";
import { InstagramManagementSummary } from "@/components/course-documents/instagram-management-summary";
import { MediaManagementTabs } from "@/components/course-documents/media-management-tabs";
import { YoutubeCourseList } from "@/components/youtube-management/course-list";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";
import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import { countYoutubeAppearances } from "@/lib/youtube-management/course-list";

export default async function ContentManagementPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { admin, membership } = await requireCourseDocumentMember().catch((error) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    throw error;
  });
  const { tab } = await searchParams;
  const { data, error } = await admin.from("courses")
    .select("id,name,instructor_name,cohort,status,free_webinar_at,course_youtube_appearances(request_status)")
    .eq("workspace_id", membership.workspace_id).order("created_at", { ascending: false });
  if (error) throw new Error("강의 목록을 불러오지 못했습니다.");
  return <main className="min-h-screen">
    <header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
      <Button variant="ghost" size="icon" asChild><BackLink href="/work" aria-label="강의관리로 돌아가기"><ArrowLeft /></BackLink></Button>
      <h1 className="ml-3 text-xl font-semibold">강사 인스타그램 / 유튜브 관리</h1>
    </div></header>
    <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
      <MediaManagementTabs initialTab={tab} summary={<InstagramManagementSummary />} instagram={<InstagramManagementWorkspace />} youtube={
        <YoutubeCourseList embedded courses={sortByNearestWebinar(data ?? []).map((course) => ({ ...course, ...countYoutubeAppearances(course.course_youtube_appearances ?? []) }))} />
      } />
    </div>
  </main>;
}
