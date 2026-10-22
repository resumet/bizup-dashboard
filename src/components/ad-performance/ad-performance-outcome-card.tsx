import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adPerformanceOutcomeSummary, type AdPerformanceWebinarOutcome } from "@/lib/ad-performance/outcome-summary";
import type { AdPerformanceDailyMetric } from "@/lib/ad-performance/types";

export function AdPerformanceOutcomeCard({ metrics, webinar = null, courseId, error }: {
  metrics: AdPerformanceDailyMetric[];
  webinar?: AdPerformanceWebinarOutcome | null;
  courseId?: string;
  error?: string;
}) {
  const summary = adPerformanceOutcomeSummary(metrics, webinar);
  return <Card className="mt-3">
    <CardHeader><CardTitle>성과 요약</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm leading-7">{summary.split(/\(([^)]*)\)/gu).map((part, index) => index % 2 === 1
        ? <span key={index}>(<mark className="box-decoration-clone rounded-sm bg-yellow-200 px-1 font-bold text-neutral-950 underline underline-offset-2">{part}</mark>)</span>
        : part)}</p>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {courseId === undefined ? null : courseId ? <Link href={`/services/course-webinars/${courseId}`} className="text-sm font-medium text-primary hover:underline">라이브 웨비나 실적 확인</Link>
        : <p className="text-sm text-muted-foreground">사전설정에서 강의를 연결하면 라이브 웨비나 실적이 표시됩니다.</p>}
    </CardContent>
  </Card>;
}
