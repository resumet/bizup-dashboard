"use client";

import { useRef, useState } from "react";
import { Columns2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CourseOrdersResponse } from "@/lib/course-orders/types";
import type { MonthlyAnalysis } from "@/lib/course-settlements/engine";
import { compareSettlementRoster } from "@/lib/course-settlements/roster-comparison";
import { comparisonWindowHtml } from "@/lib/course-settlements/roster-comparison-window";

export function RosterComparisonButton({ courseId, courseName, instructor, months }: { courseId: string; courseName: string; instructor: string; months: MonthlyAnalysis[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function openComparison() {
    if (inFlight.current) return;
    setError("");
    const popup = window.open("", "_blank", "popup,width=1440,height=960,scrollbars=yes,resizable=yes");
    if (!popup) { setError("비교 창을 열 수 없습니다. 팝업을 허용해 주세요."); return; }
    popup.opener = null;
    popup.document.title = "주문·정산 명단 비교";
    popup.document.body.textContent = "주문내역을 불러오는 중입니다…";
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/course-operations/${encodeURIComponent(courseId)}/orders`, { cache: "no-store", signal: AbortSignal.timeout(60000) });
      const data = await response.json() as CourseOrdersResponse & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "주문내역을 불러오지 못했습니다.");
      if (popup.closed) return;
      const html = comparisonWindowHtml(courseName, instructor, compareSettlementRoster(data.orders, months, instructor));
      popup.document.open(); popup.document.write(html); popup.document.close();
      popup.focus();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "명단 비교에 실패했습니다.";
      setError(message);
      if (!popup.closed) popup.document.body.textContent = message;
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="flex max-w-full flex-col gap-2"><Button variant="outline" disabled={busy} onClick={() => void openComparison()}>{busy ? <Loader2 className="animate-spin" /> : <Columns2 />}주문·정산 명단 비교</Button>{error && <p role="alert" className="max-w-sm text-sm text-destructive">{error}</p>}</div>;
}
