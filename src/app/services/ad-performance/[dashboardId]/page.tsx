import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { CreativePerformance } from "@/components/ad-performance/creative-performance";
import { CreativeMediaSummary } from "@/components/ad-performance/creative-media-summary";
import type { CreativeData } from "@/lib/ad-creative/model";
import { loadCreativeCourse, loadCreativeData } from "@/lib/ad-creative/server";

import { AdPerformanceDashboard } from "@/components/ad-performance/ad-performance-dashboard";
import { loadAdPerformanceDashboard } from "@/lib/ad-performance/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdPerformanceWebinarOutcome } from "@/lib/ad-performance/outcome-summary";
import { loadWebinarRecord } from "@/lib/course-webinars/server";

export const dynamic = "force-dynamic";

async function CourseCreativePerformance({ source, summary = false }: { source: Promise<CreativeData | null>; summary?: boolean }) {
  const data = await source;
  if (!data) return <p role="alert" className="text-sm text-destructive">소재성과를 불러오지 못했습니다. 페이지를 새로고침해 주세요.</p>;
  if (!summary) return <CreativePerformance key={data.course?.id} initialData={data} embedded />;
  if (!data.url) return <p className="text-sm text-muted-foreground">원본 데이터 설정에서 Google Sheets 주소를 입력해 주세요.</p>;
  if (!data.course?.instructor_nickname) return <p className="text-sm text-muted-foreground">강의 기본 정보에 강사 닉네임을 입력해 주세요.</p>;
  if (!data.rows.length) return <p className="text-sm text-muted-foreground">이 강의에 해당하는 소재성과가 없습니다.</p>;
  return <CreativeMediaSummary rows={data.rows} />;
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
  const creativeSource = data.course
    ? loadCreativeCourse(membership.workspace_id, data.course.id)
      .then(course => loadCreativeData(membership.workspace_id, course))
      .catch(() => null)
    : null;
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
      mediaSummary={creativeSource && <Suspense fallback={<p role="status">매체별 요약을 불러오는 중입니다.</p>}>
        <CourseCreativePerformance source={creativeSource} summary />
      </Suspense>}
      webinarOutcome={webinar}
      webinarError={webinarError}
    >
      {creativeSource ? <Suspense fallback={<p role="status">소재성과를 불러오는 중입니다.</p>}>
        <CourseCreativePerformance source={creativeSource} />
      </Suspense> : <p className="text-sm text-muted-foreground">사전설정에서 강의를 선택해 주세요.</p>}
    </AdPerformanceDashboard>
  );
}
