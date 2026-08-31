"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  RosterOptionAnalysis,
  RosterSourceAnalysis,
} from "@/lib/jobs/filter";

export function RosterAnalysisCards({
  sourceItems,
  optionItems,
  totalCount,
}: {
  sourceItems: RosterSourceAnalysis[];
  optionItems: RosterOptionAnalysis[];
  totalCount: number;
}) {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <RosterAnalysisCard
        title="유입 경로 분석"
        description="전체 수강생이 어떤 경로로 유입되었는지 보여줍니다."
        categoryLabel="유입 경로"
        itemUnit="경로"
        chartId="source-analysis-chart"
        barClassName="bg-primary"
        items={sourceItems.map((item) => ({
          label: item.source,
          count: item.count,
          percentage: item.percentage,
        }))}
        totalCount={totalCount}
      />
      <RosterAnalysisCard
        title="옵션별 인원 분석"
        description="전체 수강생이 선택한 옵션별 인원과 비율을 보여줍니다."
        categoryLabel="옵션명"
        itemUnit="옵션"
        chartId="option-analysis-chart"
        barClassName="bg-emerald-500"
        items={optionItems.map((item) => ({
          label: item.optionName,
          count: item.count,
          percentage: item.percentage,
        }))}
        totalCount={totalCount}
      />
    </div>
  );
}

function RosterAnalysisCard({
  title,
  description,
  categoryLabel,
  itemUnit,
  chartId,
  barClassName,
  items,
  totalCount,
}: {
  title: string;
  description: string;
  categoryLabel: string;
  itemUnit: string;
  chartId: string;
  barClassName: string;
  items: Array<{ label: string; count: number; percentage: number }>;
  totalCount: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {items.length.toLocaleString("ko-KR")}개 {itemUnit} · 전체{" "}
              {totalCount.toLocaleString("ko-KR")}명
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={expanded}
              aria-controls={chartId}
              onClick={() => setExpanded((current) => !current)}
            >
              <ChevronDown
                className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              />
              {expanded ? "접기" : "펼치기"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded ? (
        <CardContent id={chartId} className="overflow-x-auto">
          <figure
            className="min-w-[480px] rounded-xl border bg-muted/15 p-5"
            aria-label={`${title} 가로 막대그래프`}
          >
            <div className="mb-3 grid grid-cols-[minmax(7rem,10rem)_minmax(12rem,1fr)_7rem] items-end gap-4 text-xs text-muted-foreground">
              <span>{categoryLabel}</span>
              <div className="flex justify-between" aria-hidden="true">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
              </div>
              <span className="text-right">인원 · 비율</span>
            </div>
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.label}
                  className="grid grid-cols-[minmax(7rem,10rem)_minmax(12rem,1fr)_7rem] items-center gap-4"
                >
                  <span
                    className="truncate text-sm font-medium"
                    title={item.label}
                  >
                    {item.label}
                  </span>
                  <div
                    className="h-8 overflow-hidden rounded-md bg-muted"
                    role="progressbar"
                    aria-label={`${item.label} 비율`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={item.percentage}
                  >
                    <div
                      className={`h-full rounded-md ${barClassName}`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <span className="text-right text-sm tabular-nums text-muted-foreground">
                    {item.count.toLocaleString("ko-KR")}명 · {item.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </figure>
        </CardContent>
      ) : null}
    </Card>
  );
}
