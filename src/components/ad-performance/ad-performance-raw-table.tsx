"use client";

import { calculateDailyAdSpend } from "@/lib/ad-performance/calculation";
import type { AdPerformanceDailyMetric, AdPerformanceOrganicChannel } from "@/lib/ad-performance/types";

type AdPerformanceRawTableProps = {
  metrics: AdPerformanceDailyMetric[];
  channels: AdPerformanceOrganicChannel[];
  onEdit: (metricDate: string) => void;
  disabled?: boolean;
};

const numberFormat = new Intl.NumberFormat("ko-KR");
const wonFormat = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const numberCell = "border-r border-b px-1.5 py-1.5 text-right tabular-nums whitespace-nowrap last:border-r-0";
const columnHead = "border-r border-b px-1.5 py-1.5 text-center font-medium whitespace-nowrap last:border-r-0";

function displayNumber(value: number) {
  return numberFormat.format(value);
}

function displayUnitCost(value: number | null) {
  return value === null ? "—" : wonFormat.format(value);
}

export function AdPerformanceRawTable({ metrics, channels, onEdit, disabled = false }: AdPerformanceRawTableProps) {
  const organicColumnCount = Math.max(1, channels.length);
  const dailyMetrics = calculateDailyAdSpend(metrics);

  return (
    <div className="w-full overflow-x-auto rounded-md border" role="region" aria-label="날짜별 광고 원시데이터 표" tabIndex={0}>
      <table className="w-full min-w-max border-collapse text-xs leading-tight">
        <caption className="sr-only">날짜별 광고 원시데이터. 각 날짜의 수정 버튼으로 입력 창을 열 수 있습니다.</caption>
        <thead className="bg-muted/65 text-muted-foreground">
          <tr>
            <th scope="col" rowSpan={2} className="sticky left-0 z-20 min-w-[100px] border-r border-b bg-muted px-2 py-1.5 text-left font-semibold whitespace-nowrap">날짜</th>
            <th scope="colgroup" colSpan={7} className="border-r border-b px-1 py-1.5 text-center font-semibold">Google 광고</th>
            <th scope="colgroup" colSpan={7} className="border-r border-b px-1 py-1.5 text-center font-semibold">Meta 광고</th>
            <th scope="colgroup" colSpan={organicColumnCount} className="border-r border-b px-1 py-1.5 text-center font-semibold">자연 유입</th>
            <th scope="colgroup" colSpan={2} className="border-r border-b px-1 py-1.5 text-center font-semibold">운영</th>
            <th scope="col" rowSpan={2} className="border-b px-2 py-1.5 text-center font-semibold">입력</th>
          </tr>
          <tr>
            <th scope="col" className={columnHead}>노출</th>
            <th scope="col" className={columnHead}>클릭</th>
            <th scope="col" className={columnHead}>광고 DB</th>
            <th scope="col" className={columnHead}>광고비</th>
            <th scope="col" className={columnHead}>광고 DB당 단가</th>
            <th scope="col" className={columnHead}>랜딩 DB</th>
            <th scope="col" className={columnHead}>랜딩 DB당 단가</th>
            <th scope="col" className={columnHead}>노출</th>
            <th scope="col" className={columnHead}>클릭</th>
            <th scope="col" className={columnHead}>광고 DB</th>
            <th scope="col" className={columnHead}>광고비</th>
            <th scope="col" className={columnHead}>광고 DB당 단가</th>
            <th scope="col" className={columnHead}>랜딩 DB</th>
            <th scope="col" className={columnHead}>랜딩 DB당 단가</th>
            {channels.length ? channels.map((channel) => (
              <th key={channel.id} scope="col" title={channel.name} className={`${columnHead} max-w-[100px] truncate`}>{channel.name}</th>
            )) : <th scope="col" className={columnHead}>채널 없음</th>}
            <th scope="col" className={columnHead}>누적 DB</th>
            <th scope="col" className={columnHead}>채팅방</th>
          </tr>
        </thead>
        <tbody>
          {dailyMetrics.length ? dailyMetrics.map((metric) => (
            <tr key={metric.metricDate} className="group even:bg-muted/25 hover:bg-muted/45">
              <th scope="row" className="sticky left-0 z-10 border-r border-b bg-background px-2 py-1.5 text-left font-medium tabular-nums whitespace-nowrap group-hover:bg-muted">{metric.metricDate}</th>
              <td className={numberCell}>{displayNumber(metric.googleImpressions)}</td>
              <td className={numberCell}>{displayNumber(metric.googleClicks)}</td>
              <td className={numberCell}>{displayNumber(metric.googleAdLeads)}</td>
              <td className={numberCell}>{displayNumber(metric.googleSpend)}</td>
              <td className={numberCell}>{displayUnitCost(metric.googleAdLeadCost)}</td>
              <td className={numberCell}>{displayNumber(metric.googleLandingLeads)}</td>
              <td className={numberCell}>{displayUnitCost(metric.googleLandingLeadCost)}</td>
              <td className={numberCell}>{displayNumber(metric.metaImpressions)}</td>
              <td className={numberCell}>{displayNumber(metric.metaClicks)}</td>
              <td className={numberCell}>{displayNumber(metric.metaAdLeads)}</td>
              <td className={numberCell}>{displayNumber(metric.metaSpend)}</td>
              <td className={numberCell}>{displayUnitCost(metric.metaAdLeadCost)}</td>
              <td className={numberCell}>{displayNumber(metric.metaLandingLeads)}</td>
              <td className={numberCell}>{displayUnitCost(metric.metaLandingLeadCost)}</td>
              {channels.length ? channels.map((channel) => (
                <td key={channel.id} className={numberCell}>{displayNumber(metric.organicLeads[channel.id] ?? 0)}</td>
              )) : <td className={`${numberCell} text-muted-foreground`}>—</td>}
              <td className={numberCell}>{displayNumber(metric.adminCumulativeLeads)}</td>
              <td className={numberCell}>{metric.chatRoomMembers === null ? "—" : displayNumber(metric.chatRoomMembers)}</td>
              <td className="border-b px-1.5 py-1 text-center">
                <button
                  type="button"
                  className="rounded border border-input bg-background px-2 py-1 font-medium whitespace-nowrap hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`${metric.metricDate} 원시데이터 수정`}
                  disabled={disabled}
                  onClick={() => onEdit(metric.metricDate)}
                >
                  수정
                </button>
              </td>
            </tr>
          )) : (
            <tr><td colSpan={18 + organicColumnCount} className="px-4 py-10 text-center text-sm text-muted-foreground">입력된 원시데이터가 없습니다.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
