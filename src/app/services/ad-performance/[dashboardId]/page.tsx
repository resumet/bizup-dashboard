import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CreativePerformance } from "@/components/ad-performance/creative-performance";
import { loadCreativeCourse, loadCreativeData } from "@/lib/ad-creative/server";

import { AdPerformanceDashboard } from "@/components/ad-performance/ad-performance-dashboard";
import { loadAdPerformanceDashboard } from "@/lib/ad-performance/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdPerformanceWebinarOutcome } from "@/lib/ad-performance/outcome-summary";
import { loadWebinarRecord } from "@/lib/course-webinars/server";

export const dynamic = "force-dynamic";

async function CourseCreativePerformance({ workspaceId, courseId }: { workspaceId: string; courseId: string }) {
  let data;
  try {
    const course = await loadCreativeCourse(workspaceId, courseId);
    data = await loadCreativeData(workspaceId, course);
  } catch {
    return <p role="alert" className="text-sm text-destructive">소재성과를 불러오지 못했습니다. 페이지를 새로고침해 주세요.</p>;
  }
  return <CreativePerformance key={courseId} initialData={data} embedded />;
}

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
    >
      {data.course ? <Suspense fallback={<p role="status">소재성과를 불러오는 중입니다.</p>}>
        <CourseCreativePerformance workspaceId={membership.workspace_id} courseId={data.course.id} />
      </Suspense> : <p className="text-sm text-muted-foreground">사전설정에서 강의를 선택해 주세요.</p>}
    </AdPerformanceDashboard>
  );
}
