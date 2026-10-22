import { notFound, redirect } from "next/navigation";

import { AdPerformanceDashboard } from "@/components/ad-performance/ad-performance-dashboard";
import { loadAdPerformanceDashboard } from "@/lib/ad-performance/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdPerformanceWebinarOutcome } from "@/lib/ad-performance/outcome-summary";

export const dynamic = "force-dynamic";

export default async function AdPerformanceDetailPage({ params }: { params: Promise<{ dashboardId: string }> }) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const [{ dashboardId }, membership] = await Promise.all([
    params,
    requireCourseOperationsMembership(user.id),
  ]);
  const data = await loadAdPerformanceDashboard(membership.workspace_id, dashboardId);
  if (!data) notFound();
  const webinar = data.course ? await supabase.from("course_webinar_metrics")
    .select("ad_spend,group_chat_count,live_peak_count,payment_count,revenue")
    .eq("course_id", data.course.id).maybeSingle() : null;
  return (
    <AdPerformanceDashboard
      key={`${data.course?.id ?? "no-course"}:${data.sheetState?.updatedAt ?? "no-sheet-state"}`}
      initialData={data}
      webinarOutcome={(webinar?.data as AdPerformanceWebinarOutcome | null | undefined) ?? null}
      webinarError={webinar?.error ? "라이브 웨비나 실적을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요." : undefined}
    />
  );
}
