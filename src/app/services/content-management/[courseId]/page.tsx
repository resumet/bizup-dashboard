import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { InstagramManagementWorkspace } from "@/components/course-documents/instagram-management-workspace";
import { MediaManagementTabs } from "@/components/course-documents/media-management-tabs";
import { YoutubeWorkspace } from "@/components/youtube-management/workspace";
import { loadMedia, MediaError } from "@/lib/youtube-management/server";

export default async function CourseContentPage({ params, searchParams }: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ tab?: string; youtubeTab?: string }>;
}) {
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  const initial = await loadMedia(courseId).catch((error) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof MediaError && error.status === 404) notFound();
    throw error;
  });
  const { tab, youtubeTab } = await searchParams;
  return <main className="mx-auto max-w-[1900px] space-y-6 px-5 py-8 lg:px-8">
    <Link href="/services/content-management" className="text-sm hover:underline">← 강사 인스타그램 / 유튜브 관리</Link>
    <MediaManagementTabs initialTab={tab} instagram={<InstagramManagementWorkspace courseId={courseId} />}
      youtube={<YoutubeWorkspace embedded initial={initial} initialTab={youtubeTab === "brief" ? "brief" : "schedule"} />} />
  </main>;
}
