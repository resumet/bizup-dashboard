import { redirect } from "next/navigation";

export default async function CourseContentPage({ params, searchParams }: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ tab?: string; youtubeTab?: string }>;
}) {
  const { courseId } = await params;
  const { tab, youtubeTab } = await searchParams;
  const encodedCourseId = encodeURIComponent(courseId);
  if (tab === "youtube") {
    redirect(`/services/youtube-management/${encodedCourseId}?tab=${youtubeTab === "brief" ? "brief" : "schedule"}`);
  }
  redirect(`/services/instagram-management/${encodedCourseId}`);
}
