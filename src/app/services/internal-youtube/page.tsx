import { redirect } from "next/navigation";
import { InternalYoutubeWorkspace } from "@/components/internal-youtube/workspace";
import { loadInternalYoutube } from "@/lib/internal-youtube/server";

export default async function InternalYoutubePage({ searchParams }: { searchParams: Promise<{ courseId?: string }> }) {
  const data = await loadInternalYoutube().catch(error => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    throw error;
  });
  return <InternalYoutubeWorkspace data={data} courseId={(await searchParams).courseId ?? ""} />;
}
