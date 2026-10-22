import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizeAdPerformance } from "@/lib/ad-performance/calculation";
import type { AdPerformanceDailyMetric } from "@/lib/ad-performance/types";

const number = new Intl.NumberFormat("ko-KR");

function formatWon(value: number | null) {
  return value === null ? "-" : `${number.format(Math.round(value))}원`;
}

function SummaryCard({ label, value, detail, negative = false }: {
  label: string;
  value: string;
  detail: string;
  negative?: boolean;
}) {
  return <Card size="sm" className={negative ? "ring-destructive/40" : undefined}>
    <CardHeader className="gap-0.5">
      <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      <p className={`text-xl font-semibold tabular-nums ${negative ? "text-destructive" : ""}`}>{value}</p>
      <CardDescription className="text-[11px] leading-snug">{detail}</CardDescription>
    </CardHeader>
  </Card>;
}

function SpendSummaryCard({ spend, budget, googleSpend, metaSpend }: {
  spend: number;
  budget: number;
  googleSpend: number;
  metaSpend: number;
}) {
  const budgetRate = budget ? `${((spend / budget) * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%` : "미설정";
  return <Card size="sm"><CardHeader className="gap-0.5">
    <CardTitle className="text-xs font-medium text-muted-foreground">전체 집행비용 누적</CardTitle>
    <p className="break-all text-xl font-semibold tabular-nums">{formatWon(spend)}</p>
    <CardDescription className="text-[11px]">예산 사용률 {budgetRate}</CardDescription>
    <dl className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
      <div className="min-w-0 border-r pr-2"><dt className="text-muted-foreground">Google</dt><dd className="truncate font-medium tabular-nums">{formatWon(googleSpend)}</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">Meta</dt><dd className="truncate font-medium tabular-nums">{formatWon(metaSpend)}</dd></div>
    </dl>
  </CardHeader></Card>;
}

function DatabaseSummaryCard({ paidLandingLeads, organicLandingLeads, totalDatabaseLeads, adminCumulativeLeads }: {
  paidLandingLeads: number;
  organicLandingLeads: number;
  totalDatabaseLeads: number;
  adminCumulativeLeads: number;
}) {
  const items = [
    { label: "총합 랜딩접수 DB", value: paidLandingLeads },
    { label: "오가닉DB 총합", value: organicLandingLeads },
    { label: "전체DB 총합계", value: totalDatabaseLeads },
    { label: "비즈업에 등록된 DB", value: adminCumulativeLeads },
  ];
  return <Card size="sm" className="sm:col-span-2 lg:col-span-2"><CardHeader className="gap-2">
    <CardTitle className="text-xs font-medium text-muted-foreground">DB 유입 합계</CardTitle>
    <dl className="grid grid-cols-2 gap-y-3 sm:grid-cols-4 sm:divide-x">
      {items.map((item) => <div key={item.label} className="min-w-0 px-2 first:pl-0 last:pr-0">
        <dt className="min-h-7 text-[11px] leading-tight text-muted-foreground">{item.label}</dt>
        <dd className="mt-1 text-lg font-semibold tabular-nums">{number.format(item.value)}<span className="ml-0.5 text-[11px] font-normal text-muted-foreground">건</span></dd>
      </div>)}
    </dl>
  </CardHeader></Card>;
}

export function AdPerformanceSummaryCards({ metrics, totalBudget, className = "mt-6" }: {
  metrics: AdPerformanceDailyMetric[];
  totalBudget: number;
  className?: string;
}) {
  const summary = summarizeAdPerformance(metrics, totalBudget);
  return <section aria-label="성과 요약" className={`${className} grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7`}>
    <SpendSummaryCard spend={summary.spend} budget={totalBudget} googleSpend={summary.googleSpend} metaSpend={summary.metaSpend} />
    <SummaryCard label="잔여 예산" value={formatWon(summary.remainingBudget)} detail={`총예산 ${formatWon(totalBudget)}`} negative={summary.remainingBudget < 0} />
    <DatabaseSummaryCard paidLandingLeads={summary.paidLandingLeads} organicLandingLeads={summary.organicLandingLeads} totalDatabaseLeads={summary.totalDatabaseLeads} adminCumulativeLeads={summary.adminCumulativeLeads} />
    <SummaryCard label="톡방입장인원" value={`${number.format(summary.latestChatRoomMembers)}명`} detail="최종 톡방누적인원" />
    <SummaryCard label="랜딩접수DB단가" value={formatWon(summary.paidLandingLeadCost)} detail="총광고비 ÷ 랜딩접수DB" />
    <SummaryCard label="톡방접수DB단가" value={formatWon(summary.chatRoomEntrantCost)} detail="총광고비 ÷ 톡방입장인원" />
  </section>;
}
