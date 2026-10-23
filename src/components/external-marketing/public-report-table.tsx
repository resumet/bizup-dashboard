"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildExternalMarketingReportRows,
  buildExternalMarketingReportTotalRow,
  type ExternalMarketingReportRow,
} from "@/lib/external-marketing/report";
import type { AdPerformanceDailyMetric } from "@/lib/ad-performance/types";
import { ExternalMarketingSaveToast } from "./save-toast";

const number = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
function cost(value: number | null) { return value === null ? "—" : won.format(value); }
function rate(value: number | null) { return value === null ? "—" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`; }

const head = "border-r border-b px-3 py-2 text-center text-xs font-medium whitespace-nowrap last:border-r-0";
const cell = "border-r border-b px-3 py-2 text-right text-xs tabular-nums whitespace-nowrap last:border-r-0";

function ReportRow({ row, total = false, onDateClick }: {
  row: ExternalMarketingReportRow;
  total?: boolean;
  onDateClick?: (metricDate: string) => void;
}) {
  return <tr className={total ? "bg-muted/80 font-semibold" : "even:bg-muted/20 hover:bg-muted/40"}>
    <th scope="row" className={`${cell} text-left font-medium`}>
      {onDateClick ? <button
        type="button"
        className="rounded-sm text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${row.metricDate} 단톡방 누적 입장 인원 입력`}
        onClick={() => onDateClick(row.metricDate)}
      >{row.metricDate}</button> : row.metricDate}
    </th>
    <td className={cell}>{number.format(row.impressions)}</td>
    <td className={cell}>{number.format(row.clicks)}</td>
    <td className={cell}>{rate(row.clickConversionRate)}</td>
    <td className={cell}>{rate(row.landingConversionRate)}</td>
    <td className={`${cell} font-semibold`}>{cost(row.spend)}</td>
    <td className={cell}>{number.format(row.landingReceptionDb)}</td>
    <td className={cell}>{row.chatRoomEntrants === null ? "—" : number.format(row.chatRoomEntrants)}</td>
    <td className={cell}>{row.chatRoomCumulative === null ? "—" : number.format(row.chatRoomCumulative)}</td>
    <td className={cell}>{cost(row.adDbUnitCost)}</td>
    <td className={cell}><span className="block">G {cost(row.googleLandingDbUnitCost)}</span><span className="block">M {cost(row.metaLandingDbUnitCost)}</span></td>
    <td className={cell}>{cost(row.landingReceptionDbUnitCost)}</td>
    <td className={cell}>{cost(row.chatReceptionDbUnitCost)}</td>
  </tr>;
}

export function PublicExternalMarketingReportTable({ metrics, token }: {
  metrics: AdPerformanceDailyMetric[];
  token: string;
}) {
  const router = useRouter();
  const rows = buildExternalMarketingReportRows(metrics);
  const total = rows.length ? buildExternalMarketingReportTotalRow(metrics) : null;
  const cumulativeByDate = new Map(metrics.map((metric) => [metric.metricDate, metric.chatRoomMembers]));
  const [selectedDate, setSelectedDate] = useState("");
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function openChatMembersInput(metricDate: string) {
    const current = cumulativeByDate.get(metricDate);
    setSelectedDate(metricDate);
    setInput(current == null ? "" : String(current));
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const normalized = input.replaceAll(",", "").trim();
    const value = normalized === "" ? null : Number(normalized);
    if (value !== null && (!/^\d+$/u.test(normalized) || !Number.isSafeInteger(value))) {
      setError("0 이상의 정수로 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/public/external-marketing/report/${token}/chat-members/${selectedDate}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatMembersCumulative: value }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "단톡방 입장 인원을 저장하지 못했습니다.");
      setSelectedDate("");
      setNotice("단톡방 입장 인원을 저장했습니다.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "단톡방 입장 인원을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="overflow-x-auto rounded-lg border" role="region" aria-label="날짜별 광고집행 결과 표" tabIndex={0}><table className="w-full min-w-[1620px] border-collapse">
      <caption className="sr-only">날짜별 광고 노출, 클릭, 전환율, 광고비, 랜딩접수 DB, 오늘 및 누적 단톡방 인원과 DB 단가</caption>
      <thead className="bg-muted/65 text-muted-foreground"><tr><th className={`${head} text-left`}>날짜</th><th className={head}>총 광고노출</th><th className={head}>광고클릭</th><th className={head}>클릭전환율</th><th className={head}>랜딩전환율</th><th className={head}>광고집행비용</th><th className={head}>랜딩접수DB</th><th className={head}>오늘 단톡방 입장인원</th><th className={head}>누적 단톡방 인원</th><th className={head}>광고DB당단가</th><th className={head}>랜딩DB당단가</th><th className={head}>랜딩접수DB단가</th><th className={head}>톡방접수 DB당단가</th></tr></thead>
      <tbody>{total ? <ReportRow row={total} total /> : null}{rows.length ? rows.map((row) => <ReportRow key={row.metricDate} row={row} onDateClick={openChatMembersInput} />) : <tr><td colSpan={13} className="px-5 py-12 text-center text-sm text-muted-foreground">표시할 광고집행 결과가 없습니다.</td></tr>}</tbody>
    </table></div>

    <Dialog open={Boolean(selectedDate)} onOpenChange={(open) => { if (!open && !saving) setSelectedDate(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>현재 누적 단톡방 인원 입력</DialogTitle></DialogHeader>
        <form className="grid gap-5" onSubmit={save}>
          <div className="grid gap-2">
            <Label htmlFor="public-chat-members">{selectedDate} 기준 현재 누적 인원</Label>
            <Input
              id="public-chat-members"
              inputMode="numeric"
              autoComplete="off"
              placeholder="예: 120"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={saving}
              autoFocus
            />
            <p className="text-xs leading-relaxed text-muted-foreground">해당 날짜까지 단톡방에 들어온 현재 누적 인원을 입력해 주세요. 오늘 입장인원은 전날 누적 인원과의 차이로 자동 계산됩니다. 값을 비우고 저장하면 입력값이 삭제됩니다.</p>
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={saving}>취소</Button></DialogClose>
            <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}저장</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <ExternalMarketingSaveToast message={notice} onDismiss={setNotice} />
  </>;
}
