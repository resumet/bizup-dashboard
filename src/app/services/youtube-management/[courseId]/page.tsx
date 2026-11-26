import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { YoutubeWorkspace } from "@/components/youtube-management/workspace";
import { toKoreaDate } from "@/lib/course-operations/schedule";
import { loadMedia, MediaError } from "@/lib/youtube-management/server";

export default async function YoutubeManagementCoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  if ((await searchParams).tab === "brief") redirect(`/services/instructor-intakes?courseId=${courseId}`);
  const initial = await loadMedia(courseId).catch((error) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof MediaError && error.status === 404) notFound();
    throw error;
  });

  return <YoutubeWorkspace initial={initial} todayKoreaDate={toKoreaDate(new Date().toISOString())} />;
}
