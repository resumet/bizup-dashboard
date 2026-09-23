import { redirect } from "next/navigation";
import { YoutubeChannels } from "@/components/youtube-analyzer/youtube-channels";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { setting } from "@/lib/youtube-analyzer/api";

export default async function YoutubeChannelsPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  await requireCourseOperationsMembership(user.id);
  return <YoutubeChannels maxUrls={setting("MAX_URLS_PER_BATCH",50,200)} />;
}
