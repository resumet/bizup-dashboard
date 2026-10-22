import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adPerformanceOutcomeSummary, getAdPerformanceOutcome, type AdPerformanceWebinarOutcome } from "@/lib/ad-performance/outcome-summary";
import type { AdPerformanceDailyMetric } from "@/lib/ad-performance/types";

export function AdPerformanceOutcomeCard({ metrics, webinar = null, courseId, error }: {
  metrics: AdPerformanceDailyMetric[];
  webinar?: AdPerformanceWebinarOutcome | null;
  courseId?: string;
  error?: string;
}) {
  const summary = adPerformanceOutcomeSummary(metrics, webinar);
  const outcome = getAdPerformanceOutcome(metrics, webinar);
  const format = (value: number | null, unit: string) => value === null ? "미입력" : `${value.toLocaleString("ko-KR")}${unit}`;
  const ratio = (value: number | null, unit = "%") => value === null ? "계산 불가" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: unit === "배" ? 2 : 1 })}${unit}`;
  const cards = [
    { title: "DB 접수", value: format(outcome.databaseLeads, "건"), details: [] },
    { title: "톡방 인원", value: format(outcome.chatMembers, "명"), details: [`DB 대비 ${ratio(outcome.chatToDb)}`] },
    { title: "라이브 최대 인원", value: format(outcome.livePeak, "명"), details: [`DB 대비 ${ratio(outcome.liveToDb)}`, `톡방 대비 ${ratio(outcome.liveToChat)}`] },
    { title: "결제 인원", value: format(outcome.payments, "명"), details: [`DB 대비 ${ratio(outcome.paymentToDb)}`, `톡방 대비 ${ratio(outcome.paymentToChat)}`, `라이브 대비 ${ratio(outcome.paymentToLive)}`] },
    { title: "전체 매출", value: format(outcome.revenue, "원"), details: [`광고비 대비 ${ratio(outcome.revenueMultiple, "배")}`] },
  ];
  return <Card className="mt-3">
    <CardHeader><CardTitle>성과 요약</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm leading-7">{summary.split(/\(([^)]*)\)/gu).map((part, index) => index % 2 === 1
        ? <span key={index}>(<mark className="box-decoration-clone rounded-sm bg-yellow-200 px-1 font-bold text-neutral-950 underline underline-offset-2">{part}</mark>)</span>
        : part)}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="성과 단계별 카드">
        {cards.map((card) => <Card key={card.title} size="sm" className="min-w-0 bg-muted/20">
          <CardHeader><CardTitle>{card.title}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="break-words text-xl font-semibold tabular-nums">{card.value}</p>
            {card.details.length ? <ul className="space-y-1 text-xs text-muted-foreground">{card.details.map((detail) => <li key={detail}>{detail}</li>)}</ul> : null}
          </CardContent>
        </Card>)}
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {courseId === undefined ? null : courseId ? <Link href={`/services/course-webinars/${courseId}`} className="text-sm font-medium text-primary hover:underline">라이브 웨비나 실적 확인</Link>
        : <p className="text-sm text-muted-foreground">사전설정에서 강의를 연결하면 라이브 웨비나 실적이 표시됩니다.</p>}
    </CardContent>
  </Card>;
}
