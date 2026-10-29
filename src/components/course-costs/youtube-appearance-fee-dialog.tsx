"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2Off, Loader2, RefreshCw } from "lucide-react";

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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { YoutubeAppearanceFeeCostDetails } from "@/lib/course-costs/types";
import { youtubeAppearanceFeeTotals } from "@/lib/course-costs/youtube-appearance-fee";

const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

function cloneDetails(details: YoutubeAppearanceFeeCostDetails) {
  return structuredClone(details);
}

export function YoutubeAppearanceFeeDialog({
  courseId,
  open,
  initialDetails,
  onOpenChange,
  onConfirm,
}: {
  courseId: string;
  open: boolean;
  initialDetails: YoutubeAppearanceFeeCostDetails | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (details: YoutubeAppearanceFeeCostDetails) => void;
}) {
  const [details, setDetails] = useState<YoutubeAppearanceFeeCostDetails | null>(() => initialDetails ? cloneDetails(initialDetails) : null);
  const [loading, setLoading] = useState(!initialDetails);
  const [error, setError] = useState("");

  async function loadCurrent() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/course-operations/${courseId}/costs/youtube-appearance-fee`, { cache: "no-store" });
      const body = await response.json() as { details?: YoutubeAppearanceFeeCostDetails; message?: string };
      if (!response.ok || !body.details) throw new Error(body.message || "유튜브 출연료 정보를 불러오지 못했습니다.");
      setDetails(body.details);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "유튜브 출연료 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialDetails) return;
    const controller = new AbortController();
    void fetch(`/api/course-operations/${courseId}/costs/youtube-appearance-fee`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { details?: YoutubeAppearanceFeeCostDetails; message?: string };
        if (!response.ok || !body.details) throw new Error(body.message || "유튜브 출연료 정보를 불러오지 못했습니다.");
        setDetails(body.details);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "유튜브 출연료 정보를 불러오지 못했습니다.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [courseId, initialDetails]);

  const totals = useMemo(
    () => details
      ? youtubeAppearanceFeeTotals(details)
      : { channelCount: 0, supplyAmount: 0, vatAmount: 0, finalAmount: 0 },
    [details],
  );
  const missingFee = details?.channels.some((channel) => channel.included && channel.appearanceFee === null) ?? false;

  function updateChannel(index: number, patch: Partial<YoutubeAppearanceFeeCostDetails["channels"][number]>) {
    setDetails((current) => current ? {
      ...current,
      channels: current.channels.map((channel, itemIndex) => itemIndex === index ? { ...channel, ...patch } : channel),
    } : current);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
      <DialogHeader>
        <DialogTitle>유튜브 출연료 등록</DialogTitle>
        <DialogDescription>채널 관리의 출연료를 공급가액으로 보고 부가세 10%를 더해 최종 지급액을 계산합니다.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground">공급가액을 수정해도 유튜브 채널 관리의 기준 금액은 변경되지 않습니다.</p>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void loadCurrent()}>
          {loading ? <Loader2 className="animate-spin"/> : <RefreshCw/>}현재 채널 정보로 다시 불러오기
        </Button>
      </div>

      {error ? <Alert variant="destructive"><AlertTitle>출연료 정보를 불러오지 못했습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {loading && !details ? <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin"/>출연 채널과 출연료를 확인하고 있습니다.</div> : null}
      {!loading && details && !details.channels.length ? <Alert><AlertTitle>등록된 출연 채널이 없습니다</AlertTitle><AlertDescription>강사 출연 유튜브 관리에서 이 강의의 출연 채널을 먼저 등록해 주세요.</AlertDescription></Alert> : null}

      {details?.channels.length ? <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14 text-center">포함</TableHead>
              <TableHead>강사 출연 유튜브</TableHead>
              <TableHead>연계된 채널 정보</TableHead>
              <TableHead className="w-60 text-right">채널 등록 금액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{details.channels.map((channel, index) => <TableRow key={`${channel.appearanceId}-${index}`} data-state={channel.included ? "selected" : undefined}>
            <TableCell className="text-center"><Checkbox checked={channel.included} aria-label={`${channel.channelName} 출연료 포함`} onCheckedChange={(checked) => updateChannel(index, { included: checked === true })}/></TableCell>
            <TableCell>
              <p className="font-medium">{channel.channelName}</p>
              {channel.channelUrl ? <a className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline" href={channel.channelUrl} target="_blank" rel="noreferrer">출연 정보 열기<ExternalLink className="size-3"/></a> : null}
            </TableCell>
            <TableCell>
              {channel.linkedChannelId ? <>
                <p className="font-medium">{channel.linkedChannelName || channel.channelName}</p>
                {channel.linkedChannelUrl ? <a className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline" href={channel.linkedChannelUrl} target="_blank" rel="noreferrer">채널 열기<ExternalLink className="size-3"/></a> : <p className="mt-1 text-xs text-muted-foreground">채널 ID {channel.linkedChannelId}</p>}
              </> : <span className="inline-flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300"><Link2Off className="size-4"/>연계 채널 없음</span>}
            </TableCell>
            <TableCell>
              <div className="relative ml-auto max-w-48">
                <Input
                  className="pr-9 text-right tabular-nums"
                  inputMode="numeric"
                  aria-label={`${channel.channelName} 공급가액`}
                  placeholder="공급가액 입력"
                  value={channel.appearanceFee === null ? "" : channel.appearanceFee.toLocaleString("ko-KR")}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/gu, "");
                    updateChannel(index, { appearanceFee: digits ? Number(digits) : null });
                  }}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
              </div>
              {channel.appearanceFee !== null ? <p className="mt-1 text-right text-xs tabular-nums text-muted-foreground">
                VAT {won(Math.round(channel.appearanceFee * 0.1))} · 지급 {won(channel.appearanceFee + Math.round(channel.appearanceFee * 0.1))}
              </p> : null}
            </TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div> : null}

      {details ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">포함된 출연 채널</p><p className="mt-1 text-xl font-semibold tabular-nums">{totals.channelCount.toLocaleString("ko-KR")}개</p></div>
        <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">공급가액 합계</p><p className="mt-1 text-xl font-semibold tabular-nums">{won(totals.supplyAmount)}</p></div>
        <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">부가세 10%</p><p className="mt-1 text-xl font-semibold tabular-nums">{won(totals.vatAmount)}</p></div>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4"><p className="text-sm text-muted-foreground">최종 지급액</p><p className="mt-1 text-xl font-semibold tabular-nums text-primary">{won(totals.finalAmount)}</p></div>
      </div> : null}
      {missingFee ? <Alert variant="destructive"><AlertTitle>출연료를 입력해 주세요</AlertTitle><AlertDescription>포함한 출연 채널 중 출연료가 비어 있는 항목이 있습니다.</AlertDescription></Alert> : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
        <Button type="button" disabled={!details || loading || missingFee || totals.channelCount === 0} onClick={() => details && onConfirm({ ...details, calculatedAt: new Date().toISOString() })}>저장</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
