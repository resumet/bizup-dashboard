import { redirect } from "next/navigation";
import { CreativePerformance } from "@/components/ad-performance/creative-performance";
import { loadCreativeData } from "@/lib/ad-creative/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdCreativePerformancePage({ searchParams }: { searchParams: Promise<{ instructor?: string; webinar?: string }> }) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const { instructor, webinar } = await searchParams;
  const data = await loadCreativeData(membership.workspace_id).catch((error: unknown) => ({
    url: "", updatedAt: "", rows: [], matchingKeywords: "", webinarName: "", error: error instanceof Error ? error.message : "소재성과 데이터를 불러오지 못했습니다.",
  }));
  return <CreativePerformance initialData={data} initialInstructor={instructor?.slice(0, 120) ?? ""} initialWebinar={webinar?.slice(0, 300) ?? ""} />;
}
