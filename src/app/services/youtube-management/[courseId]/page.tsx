import { redirect } from "next/navigation";

export default async function Page({ params, searchParams }: { params: Promise<{ courseId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { courseId } = await params;
  const { tab } = await searchParams;
  redirect(`/services/content-management/${encodeURIComponent(courseId)}?tab=youtube&youtubeTab=${tab === "brief" ? "brief" : "schedule"}`);
}
