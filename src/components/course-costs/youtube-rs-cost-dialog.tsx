"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, Users } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { YoutubeRsCostDetails } from "@/lib/course-costs/types";
import { recalculateYoutubeRsChannel, youtubeRsTotals } from "@/lib/course-costs/youtube-rs";

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

function cloneDetails(details: YoutubeRsCostDetails) {
  return structuredClone(details);
}

export function YoutubeRsCostDialog({
  courseId,
  open,
  initialDetails,
  onOpenChange,
  onConfirm,
}: {
  courseId: string;
  open: boolean;
  initialDetails: YoutubeRsCostDetails | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (details: YoutubeRsCostDetails) => void;
}) {
  const [details, setDetails] = useState<YoutubeRsCostDetails | null>(() => initialDetails ? cloneDetails(initialDetails) : null);
  const [loading, setLoading] = useState(!initialDetails);
  const [error, setError] = useState("");

  async function loadCurrent() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/course-operations/${courseId}/costs/youtube-rs`, { cache: "no-store" });
      const body = await response.json() as { details?: YoutubeRsCostDetails; message?: string };
      if (!response.ok || !body.details) throw new Error(body.message || "유튜브 RS 내역을 불러오지 못했습니다.");
      setDetails(body.details);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "유튜브 RS 내역을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialDetails) return;
    const controller = new AbortController();
    void fetch(`/api/course-operations/${courseId}/costs/youtube-rs`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { details?: YoutubeRsCostDetails; message?: string };
        if (!response.ok || !body.details) throw new Error(body.message || "유튜브 RS 내역을 불러오지 못했습니다.");
        setDetails(body.details);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "유튜브 RS 내역을 불러오지 못했습니다.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [courseId, initialDetails]);

  const totals = useMemo(() => details ? youtubeRsTotals(details) : { payerCount: 0, paymentAmount: 0, feeAmount: 0 }, [details]);
  const missingPercent = details?.channels.some((channel) => channel.payers.some((payer) => payer.included) && channel.rsPercent === null) ?? false;

  function updatePercent(channelIndex: number, value: string) {
    setDetails((current) => {
      if (!current) return current;
      const numberValue = value === "" ? null : Number(value);
      const channels = current.channels.map((channel, index) => index === channelIndex
        ? recalculateYoutubeRsChannel({ ...channel, rsPercent: numberValue })
        : channel);
      return { ...current, channels };
    });
  }

  function togglePayer(channelIndex: number, payerIndex: number, included: boolean) {
    setDetails((current) => {
      if (!current) return current;
      return {
        ...current,
        channels: current.channels.map((channel, index) => index === channelIndex ? {
          ...channel,
          payers: channel.payers.map((payer, itemIndex) => itemIndex === payerIndex ? { ...payer, included } : payer),
        } : channel),
      };
    });
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>유튜브 출연 RS 비용 등록</DialogTitle>
        <DialogDescription>강의에 등록된 출연 채널과 결제완료 명단의 RS 값을 비교합니다. 금액은 환불이 반영된 현 결제금액 기준입니다.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="size-4"/>저장된 내역을 수정 중이라면 현재 결제자·채널 정보로 다시 계산할 수 있습니다.</div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadCurrent()}>
          {loading ? <Loader2 className="animate-spin"/> : <RefreshCw/>}현재 데이터로 다시 계산
        </Button>
      </div>

      {error ? <Alert variant="destructive"><AlertTitle>내역을 불러오지 못했습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {loading && !details ? <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin"/>채널과 결제자를 확인하고 있습니다.</div> : null}
      {!loading && details && !details.channels.length ? <Alert><AlertTitle>등록된 출연 채널이 없습니다</AlertTitle><AlertDescription>강사 출연 유튜브 관리에서 채널을 먼저 등록해 주세요.</AlertDescription></Alert> : null}

      {details?.channels.map((channel, channelIndex) => {
        const channelTotals = channel.payers.reduce((result, payer) => payer.included ? {
          count: result.count + 1,
          payment: result.payment + payer.paymentAmount,
          fee: result.fee + payer.feeAmount,
        } : result, { count: 0, payment: 0, fee: 0 });
        return <section key={`${channel.appearanceId}-${channelIndex}`} className="overflow-hidden rounded-xl border">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b bg-muted/30 px-4 py-3">
            <div className="min-w-0">
              <h3 className="font-semibold">{channel.channelName}</h3>
              {channel.channelUrl ? <a className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline" href={channel.channelUrl} target="_blank" rel="noreferrer">채널 열기<ExternalLink className="size-3"/></a> : null}
            </div>
            <div className="w-36 space-y-1">
              <Label htmlFor={`youtube-rs-percent-${channelIndex}`}>RS 비율</Label>
              <div className="relative">
                <Input id={`youtube-rs-percent-${channelIndex}`} className="pr-8 text-right tabular-nums" type="number" min="0" max="100" step="any" value={channel.rsPercent ?? ""} onChange={(event) => updatePercent(channelIndex, event.target.value)}/>
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          {channel.payers.length ? <>
            <Table>
              <TableHeader><TableRow><TableHead className="w-12 text-center">포함</TableHead><TableHead>이름</TableHead><TableHead>RS 항목</TableHead><TableHead className="text-right">결제금액</TableHead><TableHead className="text-right">RS 비율</TableHead><TableHead className="text-right">수수료 금액</TableHead></TableRow></TableHeader>
              <TableBody>{channel.payers.map((payer, payerIndex) => <TableRow key={payer.orderId} data-state={payer.included ? "selected" : undefined}>
                <TableCell className="text-center"><Checkbox checked={payer.included} aria-label={`${payer.name} RS 계산 포함`} onCheckedChange={(checked) => togglePayer(channelIndex, payerIndex, checked === true)}/></TableCell>
                <TableCell className="font-medium">{payer.name}</TableCell>
                <TableCell>{payer.rsLabel}</TableCell>
                <TableCell className="text-right tabular-nums">{won(payer.paymentAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{channel.rsPercent === null ? "미설정" : `${channel.rsPercent}%`}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{channel.rsPercent === null ? "—" : won(payer.feeAmount)}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
            <div className="flex flex-wrap justify-end gap-x-5 gap-y-1 border-t bg-muted/20 px-4 py-2 text-sm tabular-nums">
              <span>{channelTotals.count.toLocaleString("ko-KR")}명</span><span>결제 {won(channelTotals.payment)}</span><strong>RS {won(channelTotals.fee)}</strong>
            </div>
          </> : <p className="px-4 py-7 text-center text-sm text-muted-foreground">이 채널과 일치하거나 유사한 RS 결제자가 없습니다.</p>}
        </section>;
      })}

      {details ? <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">총 결제자</p><p className="mt-1 text-xl font-semibold tabular-nums">{totals.payerCount.toLocaleString("ko-KR")}명</p></div>
        <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">총 결제금액</p><p className="mt-1 text-xl font-semibold tabular-nums">{won(totals.paymentAmount)}</p></div>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4"><p className="text-sm text-muted-foreground">총 RS 수수료</p><p className="mt-1 text-xl font-semibold tabular-nums text-primary">{won(totals.feeAmount)}</p></div>
      </div> : null}
      {missingPercent ? <Alert variant="destructive"><AlertTitle>RS 비율을 입력해 주세요</AlertTitle><AlertDescription>결제자가 포함된 채널의 RS 비율이 설정되지 않았습니다.</AlertDescription></Alert> : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
        <Button type="button" disabled={!details || loading || missingPercent || totals.payerCount === 0} onClick={() => details && onConfirm({ ...details, calculatedAt: new Date().toISOString() })}>확인</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
