import type { CSSProperties, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { summarizeAdPerformance, summarizeOrganicChannels } from "@/lib/ad-performance/calculation";
import type { AdPerformanceDailyMetric, AdPerformanceOrganicChannel } from "@/lib/ad-performance/types";

const number = new Intl.NumberFormat("ko-KR");
const formatWon = (value: number | null) => value === null ? "—" : `${number.format(Math.round(value))}원`;
const unitCost = (spend: number, count: number) => count > 0 ? spend / count : null;
const percentage = (value: number, total: number) => total > 0
  ? `${(value / total * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%` : "—";

type MetricColumn = {
  key: string;
  label: string;
  value: string;
  detail: string;
  valueLabel: string;
  detailLabel: string;
};

function MetricCard({ title, columns, footer, scroll = false }: {
  title: string;
  columns: MetricColumn[];
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const style: CSSProperties = { gridTemplateColumns: `repeat(${columns.length}, minmax(${scroll && columns.length > 4 ? "5.25rem" : "0"}, 1fr))` };
  return <Card size="sm" role="group" aria-label={title} className="min-w-0 rounded-lg py-4 [--card-spacing:--spacing(4)]">
    <CardHeader><CardTitle className="text-base font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="flex flex-1 flex-col gap-4">
      <div className="min-w-0 overflow-x-auto" role={scroll ? "region" : undefined} aria-label={scroll ? `${title} 채널별 지표` : undefined} tabIndex={scroll ? 0 : undefined}>
        <dl className="grid gap-x-3 gap-y-4" style={style}>
          {columns.map((column) => <div key={column.key} className="min-w-0 space-y-3">
            <dt className="truncate text-sm font-medium" title={column.label}>{column.label}</dt>
            <dd className="break-words text-sm font-semibold tabular-nums" aria-label={column.valueLabel}>{column.value}</dd>
            <dd className="break-words text-xs tabular-nums text-muted-foreground" aria-label={column.detailLabel} title={column.detailLabel}>{column.detail}</dd>
          </div>)}
        </dl>
      </div>
      {footer ? <div className="mt-auto text-xs text-muted-foreground">{footer}</div> : null}
    </CardContent>
  </Card>;
}

export function AdPerformanceSummaryCards({ metrics, totalBudget, organicChannels = [], className = "mt-6" }: {
  metrics: AdPerformanceDailyMetric[];
  totalBudget: number;
  organicChannels?: AdPerformanceOrganicChannel[];
  className?: string;
}) {
  const summary = summarizeAdPerformance(metrics, totalBudget);
  const spendColumns = [
    { key: "google", label: "구글", value: summary.googleSpend },
    { key: "meta", label: "메타", value: summary.metaSpend },
    { key: "total", label: "전체", value: summary.spend },
  ].map((item) => ({ ...item, value: formatWon(item.value), detail: totalBudget > 0 ? percentage(item.value, totalBudget) : "예산 미설정",
    valueLabel: `${item.label} 집행비용`, detailLabel: `${item.label} 예산 사용률` }));
  const adColumns = [
    { key: "google", label: "구글", count: summary.googleAdLeads, spend: summary.googleSpend },
    { key: "meta", label: "메타", count: summary.metaAdLeads, spend: summary.metaSpend },
    { key: "total", label: "전체", count: summary.adLeads, spend: summary.spend },
  ].map((item) => ({ key: item.key, label: item.label, value: `${number.format(item.count)}건`,
    detail: formatWon(unitCost(item.spend, item.count)), valueLabel: `${item.label} 광고접수DB`, detailLabel: `${item.label} 광고접수DB단가` }));
  const organicColumns = [
    ...summarizeOrganicChannels(metrics, organicChannels),
    { id: "__total__", name: "전체", count: summary.organicLandingLeads },
  ].map((item) => ({ key: item.id, label: item.name, value: `${number.format(item.count)}건`,
    detail: percentage(item.count, summary.organicLandingLeads), valueLabel: `${item.name} 오가닉DB`, detailLabel: `${item.name} 오가닉DB 비중` }));

  return <section aria-label="성과 요약" className={`${className} grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-[3fr_3fr_4fr_1.4fr]`}>
    <MetricCard title="집행비용" columns={spendColumns} footer={<p>잔여 예산 <span className={`ml-1 font-medium tabular-nums ${summary.remainingBudget < 0 ? "text-destructive" : "text-foreground"}`}>{formatWon(summary.remainingBudget)}</span></p>} />
    <MetricCard title="광고접수DB" columns={adColumns} footer={<p>랜딩접수DB단가 <span className="ml-1 font-medium tabular-nums text-foreground">{formatWon(summary.paidLandingLeadCost)}</span></p>} />
    <MetricCard title="오가닉DB" columns={organicColumns} scroll />
    <MetricCard title="톡방입장인원" columns={[{ key: "chat", label: "단톡방", value: `${number.format(summary.latestChatRoomMembers)}명`,
      detail: formatWon(summary.chatRoomEntrantCost), valueLabel: "톡방입장인원", detailLabel: "톡방접수DB단가" }]} />
  </section>;
}
