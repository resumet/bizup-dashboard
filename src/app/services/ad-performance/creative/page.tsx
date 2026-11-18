import { redirect } from "next/navigation";
import { CreativePerformance } from "@/components/ad-performance/creative-performance";
import { loadCreativeCourse, loadCreativeData } from "@/lib/ad-creative/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdCreativePerformancePage({ searchParams }: { searchParams: Promise<{ courseId?: string }> }) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const { courseId } = await searchParams;
  const course = courseId === undefined ? undefined : await loadCreativeCourse(membership.workspace_id, courseId);
  const data = await loadCreativeData(membership.workspace_id, course).catch((error: unknown) => ({
    url: "", updatedAt: "", rows: [], webinarName: "", error: error instanceof Error ? error.message : "소재성과 데이터를 불러오지 못했습니다.",
  }));
  return <CreativePerformance key={courseId ?? "all"} initialData={data} />;
}
