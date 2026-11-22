"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdPerformanceDailyMetric } from "@/lib/ad-performance/types";
import { AdPerformanceTrendChart } from "./ad-performance-trend-chart";

export function AdPerformanceVisualization({ metrics }: { metrics: AdPerformanceDailyMetric[] }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  return <Card className="mt-3">
    <CardHeader className="flex flex-row items-center justify-between gap-3">
      <CardTitle>시각화</CardTitle>
      <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} aria-controls={contentId}
        aria-label={`시각화 ${expanded ? "접기" : "펼치기"}`} onClick={() => setExpanded(current => !current)}>
        {expanded ? "접기" : "펼치기"}
        <ChevronDown className={expanded ? "rotate-180 transition-transform" : "transition-transform"} />
      </Button>
    </CardHeader>
    <CardContent id={contentId} hidden={!expanded} className="space-y-4">
      {expanded ? <>
        <AdPerformanceTrendChart metrics={metrics} group="count" />
        <AdPerformanceTrendChart metrics={metrics} group="cost" />
      </> : null}
    </CardContent>
  </Card>;
}
