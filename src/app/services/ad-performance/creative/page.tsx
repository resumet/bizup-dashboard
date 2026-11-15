import { redirect } from "next/navigation";
import { CreativePerformance } from "@/components/ad-performance/creative-performance";
import { loadCreativeData } from "@/lib/ad-creative/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdCreativePerformancePage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const data = await loadCreativeData(membership.workspace_id).catch((error: unknown) => ({
    url: "", updatedAt: "", rows: [], error: error instanceof Error ? error.message : "소재성과 데이터를 불러오지 못했습니다.",
  }));
  return <CreativePerformance initialData={data} />;
}
