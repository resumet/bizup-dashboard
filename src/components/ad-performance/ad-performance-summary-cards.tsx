import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizeAdPerformance } from "@/lib/ad-performance/calculation";
import type { AdPerformanceDailyMetric, AdPerformanceSummary } from "@/lib/ad-performance/types";

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
    <dl className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
      <dt className="text-muted-foreground">잔여 예산</dt>
      <dd className={`font-semibold tabular-nums ${budget - spend < 0 ? "text-destructive" : ""}`}>{formatWon(budget - spend)}</dd>
    </dl>
    <dl className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
      <div className="min-w-0 border-r pr-2"><dt className="text-muted-foreground">Google</dt><dd className="truncate font-medium tabular-nums">{formatWon(googleSpend)}</dd></div>
      <div className="min-w-0"><dt className="text-muted-foreground">Meta</dt><dd className="truncate font-medium tabular-nums">{formatWon(metaSpend)}</dd></div>
    </dl>
  </CardHeader></Card>;
}

function DatabaseSummaryCard({ summary }: { summary: AdPerformanceSummary }) {
  const items = [
    { label: "총합 랜딩접수 DB", value: summary.paidLandingLeads },
    { label: "오가닉DB 총합", value: summary.organicLandingLeads },
    { label: "전체DB 총합계", value: summary.totalDatabaseLeads },
    { label: "비즈업에 등록된 DB", value: summary.adminCumulativeLeads },
  ];
  const channels = [
    { label: "구글광고접수", count: summary.googleAdLeads, spend: summary.googleSpend },
    { label: "메타광고접수", count: summary.metaAdLeads, spend: summary.metaSpend },
  ];
  return <Card size="sm" className="xl:col-span-2"><CardHeader className="gap-3">
    <CardTitle className="text-xs font-medium text-muted-foreground">DB 유입 합계</CardTitle>
    <dl className="grid grid-cols-2 divide-x rounded-lg border bg-muted/20 p-3">
      {channels.map((channel) => <div key={channel.label} className="min-w-0 px-3 first:pl-0 last:pr-0">
        <dt className="text-xs text-muted-foreground">{channel.label}</dt>
        <dd className="mt-1 text-lg font-semibold tabular-nums">{number.format(channel.count)}건</dd>
        <dd className="mt-0.5 text-sm tabular-nums" aria-label={`${channel.label} DB당 접수 단가`} title="매체별 광고비 ÷ 광고접수 DB">{formatWon(channel.count > 0 ? channel.spend / channel.count : null)}</dd>
      </div>)}
    </dl>
    <dl className="grid grid-cols-2 gap-y-3 sm:grid-cols-4 sm:divide-x md:grid-cols-2 md:divide-x-0 xl:grid-cols-4 xl:divide-x">
      {items.map((item) => <div key={item.label} className="min-w-0 px-2 first:pl-0 last:pr-0">
        <dt className="min-h-7 text-[11px] leading-tight text-muted-foreground">{item.label}</dt>
        <dd className="mt-1 text-lg font-semibold tabular-nums">{number.format(item.value)}<span className="ml-0.5 text-[11px] font-normal text-muted-foreground">건</span></dd>
      </div>)}
    </dl>
  </CardHeader></Card>;
}

function UnitCostSummaryCard({ summary }: { summary: AdPerformanceSummary }) {
  const items = [
    { label: "광고접수DB단가", value: summary.adLeadCost, formula: "총광고비 ÷ 광고접수DB" },
    { label: "랜딩접수DB단가", value: summary.paidLandingLeadCost, formula: "총광고비 ÷ 랜딩접수DB" },
    { label: "톡방접수DB단가", value: summary.chatRoomEntrantCost, formula: "총광고비 ÷ 톡방입장인원" },
  ];
  return <Card size="sm"><CardHeader className="gap-2">
    <CardTitle className="text-xs font-medium text-muted-foreground">DB당 접수 단가</CardTitle>
    <dl className="divide-y">{items.map((item) => <div key={item.label} className="py-2 first:pt-0 last:pb-0" title={item.formula}>
      <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{formatWon(item.value)}</dd>
    </div>)}</dl>
  </CardHeader></Card>;
}

export function AdPerformanceSummaryCards({ metrics, totalBudget, className = "mt-6" }: {
  metrics: AdPerformanceDailyMetric[];
  totalBudget: number;
  className?: string;
}) {
  const summary = summarizeAdPerformance(metrics, totalBudget);
  return <section aria-label="성과 요약" className={`${className} grid gap-3 md:grid-cols-2 xl:grid-cols-5`}>
    <SpendSummaryCard spend={summary.spend} budget={totalBudget} googleSpend={summary.googleSpend} metaSpend={summary.metaSpend} />
    <DatabaseSummaryCard summary={summary} />
    <SummaryCard label="톡방입장인원" value={`${number.format(summary.latestChatRoomMembers)}명`} detail="최종 톡방누적인원" />
    <UnitCostSummaryCard summary={summary} />
  </section>;
}
