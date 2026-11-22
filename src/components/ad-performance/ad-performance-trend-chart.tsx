"use client";

import { useId, useState } from "react";
import { adPerformanceTrend } from "@/lib/ad-performance/trend";
import type { AdPerformanceDailyMetric } from "@/lib/ad-performance/types";

const series = [
  { key: "adLeads", label: "누적 광고 DB", color: "#2563eb", unit: "건", axis: "count" },
  { key: "adLeadCost", label: "광고접수 DB단가", color: "#d97706", unit: "원", axis: "cost" },
  { key: "landingLeadCost", label: "랜딩접수 DB단가", color: "#9333ea", unit: "원", axis: "cost" },
  { key: "chatMembers", label: "누적 톡방인원", color: "#059669", unit: "명", axis: "count" },
] as const;
const format = (value: number | null) => value === null ? "—" : Math.round(value).toLocaleString("ko-KR");

export function AdPerformanceTrendChart({ metrics, group }: { metrics: AdPerformanceDailyMetric[]; group: "count" | "cost" }) {
  const visibleSeries = series.filter(item => item.axis === group);
  const title = group === "count" ? "누적 광고 DB / 누적 톡방인원" : "광고접수 DB단가 / 랜딩접수 DB단가";
  const rows = adPerformanceTrend(metrics);
  const [selected, setSelected] = useState<number | null>(null);
  const titleId = useId();
  if (!rows.length) return <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">날짜별 광고성과 데이터가 없습니다.</p>;
  const countMax = Math.max(1, ...rows.flatMap(row => [row.adLeads, row.chatMembers ?? 0]));
  const costMax = Math.max(1, ...rows.flatMap(row => [row.adLeadCost ?? 0, row.landingLeadCost ?? 0]));
  const maximum = group === "count" ? countMax : costMax;
  const x = (index: number) => rows.length === 1 ? 480 : 80 + index / (rows.length - 1) * 800;
  const y = (value: number, max: number) => 280 - value / max * 240;
  const activeIndex = Math.min(selected ?? rows.length - 1, rows.length - 1);
  const active = rows[activeIndex];
  return <div className="space-y-3 rounded-lg border p-4">
    <h3 className="text-sm font-semibold">{title}</h3>
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="그래프 범례">
      {visibleSeries.map(item => <li key={item.key} className="flex items-center gap-2"><span className="h-0.5 w-5" style={{ backgroundColor: item.color }} />{item.label}</li>)}
    </ul>
    <div className="overflow-x-auto">
      <svg viewBox="0 0 960 330" className="w-full min-w-[640px]" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{title} 날짜별 추이</title>
        <text x="80" y="18" fontSize="12" fill="currentColor">{group === "count" ? "건 / 명" : "원"}</text>
        {[0, 1, 2, 3, 4].map(tick => <g key={tick}>
          <line x1="80" x2="880" y1={280 - tick * 60} y2={280 - tick * 60} stroke="currentColor" opacity="0.12" />
          <text x="72" y={284 - tick * 60} textAnchor="end" fontSize="11" fill="currentColor">{format(maximum * tick / 4)}</text>
        </g>)}
        {visibleSeries.map(item => {
          const max = maximum;
          let previous = false;
          const path = rows.map((row, index) => {
            const value = row[item.key];
            if (value === null) { previous = false; return ""; }
            const segment = `${previous ? "L" : "M"}${x(index)},${y(value, max)}`;
            previous = true; return segment;
          }).join(" ");
          return <g key={item.key}>
            <path d={path} fill="none" stroke={item.color} strokeWidth="2" strokeDasharray={item.key === "landingLeadCost" ? "6 3" : undefined} />
            {rows.map((row, index) => row[item.key] === null ? null : <circle key={row.date} cx={x(index)} cy={y(row[item.key]!, max)} r="3" fill={item.color} />)}
          </g>;
        })}
        <line x1={x(activeIndex)} x2={x(activeIndex)} y1="40" y2="280" stroke="currentColor" opacity="0.4" strokeDasharray="3 3" />
        {rows.map((row, index) => <g key={row.date}>
          {index % Math.max(1, Math.ceil(rows.length / 8)) === 0 || index === rows.length - 1 ? <text x={x(index)} y="306" textAnchor="middle" fontSize="11" fill="currentColor">{row.date.slice(5)}</text> : null}
          <rect x={x(index) - Math.min(20, 400 / rows.length)} y="35" width={Math.min(40, 800 / rows.length)} height="250" fill="transparent" onMouseEnter={() => setSelected(index)} onClick={() => setSelected(index)} />
        </g>)}
      </svg>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm">조회 날짜 <select className="ml-2 rounded-md border bg-background px-2 py-1" value={activeIndex} onChange={event => setSelected(Number(event.target.value))}>{rows.map((row, index) => <option key={row.date} value={index}>{row.date}</option>)}</select></label>
      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-live="polite">
        {visibleSeries.map(item => <div key={item.key}><dt className="text-xs text-muted-foreground">{item.label}</dt><dd className="font-semibold tabular-nums">{format(active[item.key])}{active[item.key] === null ? "" : item.unit}</dd></div>)}
      </dl>
    </div>
  </div>;
}
