import type { CSSProperties, ReactNode } from "react";
import { chatAudienceAlert } from "@/lib/ad-performance/chat-alert";
import { ChatAudienceNotice } from "./chat-audience-notice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { chatRoomTarget, summarizeAdPerformance, summarizeOrganicChannels } from "@/lib/ad-performance/calculation";
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
  detail?: string;
  valueLabel: string;
  detailLabel?: string;
};

function MetricCard({ title, columns, footer }: {
  title: string;
  columns: MetricColumn[];
  footer?: ReactNode;
}) {
  const style: CSSProperties = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` };
  return <Card size="sm" role="group" aria-label={title} className="min-w-0 rounded-lg py-4 [--card-spacing:--spacing(4)]">
    <CardHeader><CardTitle className="text-base font-semibold">{title}</CardTitle></CardHeader>
    <CardContent className="flex flex-1 flex-col gap-4">
      <div className="min-w-0">
        <dl className="grid gap-x-3 gap-y-4" style={style}>
          {columns.map((column) => <div key={column.key} className="min-w-0 space-y-3">
            <dt className="truncate text-sm font-medium" title={column.label}>{column.label}</dt>
            <dd className="break-words text-sm font-semibold tabular-nums" aria-label={column.valueLabel}>{column.value}</dd>
            {column.detail === undefined ? null : <dd className="break-words text-xs tabular-nums text-muted-foreground" aria-label={column.detailLabel} title={column.detailLabel}>{column.detail}</dd>}
          </div>)}
        </dl>
      </div>
      {footer ? <div className="mt-auto text-xs text-muted-foreground">{footer}</div> : null}
    </CardContent>
  </Card>;
}

export function AdPerformanceSummaryCards({ metrics, totalBudget, organicChannels = [], className = "mt-6", showPaidMetrics = true }: {
  metrics: AdPerformanceDailyMetric[];
  totalBudget: number;
  organicChannels?: AdPerformanceOrganicChannel[];
  className?: string;
  showPaidMetrics?: boolean;
}) {
  const summary = summarizeAdPerformance(metrics, totalBudget);
  const target = chatRoomTarget(metrics, totalBudget);
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
  const landingColumns = [
    { key: "google", label: "Google", count: summary.googleLandingLeads, spend: summary.googleSpend },
    { key: "meta", label: "Meta", count: summary.metaLandingLeads, spend: summary.metaSpend },
    { key: "total", label: "전체", count: summary.paidLandingLeads, spend: summary.spend },
  ].map((item) => ({ key: item.key, label: item.label, value: `${number.format(item.count)}건`,
    detail: formatWon(unitCost(item.spend, item.count)), valueLabel: `${item.label} 랜딩페이지접수DB`, detailLabel: `${item.label} 랜딩페이지접수DB단가` }));
  const organicColumns = [
    ...summarizeOrganicChannels(metrics, organicChannels),
    { id: "__total__", name: "전체", count: summary.organicLandingLeads },
  ].map((item) => ({ key: item.id, label: item.name, value: `${number.format(item.count)}건`,
    valueLabel: `${item.name} 오가닉DB` }));

  return <section aria-label="성과 요약" className={`${className} grid items-stretch gap-3 md:grid-cols-2 ${showPaidMetrics ? "xl:grid-cols-3" : "xl:grid-cols-[3fr_4fr_3fr]"}`}>
    {!showPaidMetrics && <MetricCard title="광고비 집행" columns={[
      { key: "budget", label: "설정 광고비", value: formatWon(totalBudget), valueLabel: "전체 설정 광고비" },
      { key: "spent", label: "사용 광고비", value: formatWon(summary.spend), valueLabel: "현재 사용 광고비" },
      { key: "rate", label: "소진율", value: percentage(summary.spend, totalBudget), valueLabel: "광고비 소진율" },
    ]} footer={<dl className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t pt-3 text-sm text-foreground">
      <dt>남은 광고비</dt>
      <dd className="font-semibold tabular-nums">{totalBudget > 0 ? formatWon(summary.remainingBudget) : "예산 미설정"}</dd>
    </dl>} />}
    {showPaidMetrics && <>
      <MetricCard title="집행비용" columns={spendColumns} />
      <MetricCard title="광고접수DB" columns={adColumns} />
      <MetricCard title="랜딩페이지접수DB" columns={landingColumns} />
    </>}
    <MetricCard title="오가닉DB" columns={organicColumns} />
    <MetricCard title="단톡방 유입" columns={[{ key: "chat", label: "누적 단톡방 인원", value: `${number.format(summary.latestChatRoomMembers)}명`,
      detail: formatWon(summary.chatRoomEntrantCost), valueLabel: "누적 단톡방 인원", detailLabel: "단톡방 유입단가" },
      { key: "target", label: "목표 단톡방 인원", value: target === null ? "—" : `${number.format(target)}명`, valueLabel: "목표 단톡방 인원" },
      { key: "achievement", label: "달성률", value: target === null ? "—" : percentage(summary.latestChatRoomMembers, target), valueLabel: "단톡방 인원 달성률" },
    ]} footer={<ChatAudienceNotice message={chatAudienceAlert(summary.adLeads, metrics.some(row => row.chatRoomMembers !== null) ? summary.latestChatRoomMembers : null)} />} />
  </section>;
}
