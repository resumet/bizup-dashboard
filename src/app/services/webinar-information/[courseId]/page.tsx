import { notFound, redirect } from "next/navigation";

import { WebinarInformationEditor } from "@/components/webinar-information/webinar-information-editor";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { formatCourseDetailHeading } from "@/lib/course-operations/course-detail-heading";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_WEBINAR_COMMAND_DECK_URL } from "@/lib/webinar-information/model";

export default async function WebinarInformationPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  await requireCourseOperationsMembership(user.id);

  const [courseResult, videosResult] = await Promise.all([
    supabase
      .from("courses")
      .select("id,name,instructor_name,cohort,free_webinar_at,course_materials_link,webinar_opening_video_url,webinar_youtube_title,webinar_youtube_description,webinar_command_deck_url,webinar_banner_storage_url,webinar_youtube_live_url")
      .eq("id", courseId)
      .maybeSingle(),
    supabase
      .from("course_live_videos")
      .select("name,video_url,note")
      .eq("course_id", courseId)
      .order("sort_order")
      .order("created_at"),
  ]);

  if (courseResult.error) {
    throw new Error(`웨비나 정보 조회 실패: ${courseResult.error.code}`);
  }
  if (!courseResult.data) notFound();
  if (videosResult.error) {
    throw new Error(`기존 라이브 영상 조회 실패: ${videosResult.error.code}`);
  }

  const course = courseResult.data;
  const seenVideoUrls = new Set<string>();
  const liveVideos = (videosResult.data ?? []).flatMap((video) => {
    const videoUrl = video.video_url.trim();
    if (!videoUrl || seenVideoUrls.has(videoUrl)) return [];
    seenVideoUrls.add(videoUrl);
    return [{ name: video.name, videoUrl, note: video.note }];
  });

  return (
    <main className="min-h-screen bg-slate-50/70">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center gap-3 px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <BackLink href={`/services/course-operations/${encodeURIComponent(courseId)}`}>
              강의 상세로 돌아가기
            </BackLink>
          </Button>
          <div className="h-5 w-px bg-border" />
          <h1 className="font-semibold">웨비나 정보</h1>
          <span className="ml-auto hidden max-w-[55%] truncate text-sm text-muted-foreground md:block">
            {formatCourseDetailHeading({
              cohort: course.cohort,
              instructorName: course.instructor_name,
              courseName: course.name,
              webinarAt: course.free_webinar_at,
            })}
          </span>
        </div>
      </header>
      <div className="px-5 py-8 lg:px-8">
        <WebinarInformationEditor
          courseId={course.id}
          courseName={course.name}
          instructorName={course.instructor_name}
          cohort={course.cohort ?? ""}
          initialInformation={{
            courseMaterialsLink: course.course_materials_link,
            openingVideoUrl: course.webinar_opening_video_url,
            youtubeTitle: course.webinar_youtube_title,
            youtubeDescription: course.webinar_youtube_description || course.name,
            commandDeckUrl: course.webinar_command_deck_url || DEFAULT_WEBINAR_COMMAND_DECK_URL,
            bannerStorageUrl: course.webinar_banner_storage_url,
            youtubeLiveUrl: course.webinar_youtube_live_url,
          }}
          liveVideos={liveVideos}
        />
      </div>
    </main>
  );
}
