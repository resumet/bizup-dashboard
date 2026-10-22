import { notFound, redirect } from "next/navigation";

import { AdPerformanceDashboard } from "@/components/ad-performance/ad-performance-dashboard";
import { loadAdPerformanceDashboard } from "@/lib/ad-performance/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdPerformanceWebinarOutcome } from "@/lib/ad-performance/outcome-summary";
import { loadWebinarRecord } from "@/lib/course-webinars/server";

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
  let webinar: AdPerformanceWebinarOutcome | null = null;
  let webinarError: string | undefined;
  try {
    webinar = data.course ? await loadWebinarRecord(supabase, data.course.id) : null;
  } catch {
    webinarError = "라이브 웨비나 실적을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.";
  }
  return (
    <AdPerformanceDashboard
      key={`${data.course?.id ?? "no-course"}:${data.sheetState?.updatedAt ?? "no-sheet-state"}`}
      initialData={data}
      webinarOutcome={webinar}
      webinarError={webinarError}
    />
  );
}
