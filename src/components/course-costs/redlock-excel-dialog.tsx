"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  checkRedlockChannels,
  parseRedlockWorksheet,
  reconcileRedlockPayers,
  type RedlockActualPayer,
  type RedlockChannelCheck,
  type RedlockWorksheet,
} from "@/lib/course-costs/redlock";
import type { YoutubeRsCostDetails } from "@/lib/course-costs/types";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

function won(value: number | null) {
  return value === null ? "확인 필요" : `${value.toLocaleString("ko-KR")}원`;
}

const channelStatus = {
  matched: { label: "일치", variant: "default" as const },
  possible: { label: "유사 채널", variant: "secondary" as const },
  missing: { label: "엑셀 채널명 없음", variant: "destructive" as const },
  unmatched: { label: "실제 채널 미일치", variant: "destructive" as const },
};

export function RedlockExcelDialog({
  courseId,
  instructorName,
  open,
  onOpenChange,
}: {
  courseId: string;
  instructorName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RedlockChannelCheck[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actualChannels, setActualChannels] = useState<string[]>([]);
  const [actualPayers, setActualPayers] = useState<RedlockActualPayer[]>([]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch(`/api/course-operations/${courseId}/costs/youtube-rs`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json() as { details?: YoutubeRsCostDetails; actualPayers?: RedlockActualPayer[]; message?: string };
        if (!response.ok || !body.details) throw new Error(body.message || "실제 RS 채널 정보를 불러오지 못했습니다.");
        setActualChannels(body.details.channels.map((channel) => channel.channelName).filter(Boolean));
        setActualPayers(Array.isArray(body.actualPayers) ? body.actualPayers : []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "실제 RS 채널 정보를 불러오지 못했습니다.");
      });
    return () => controller.abort();
  }, [courseId, open]);

  const totalFee = useMemo(
    () => rows.reduce((total, row) => total + (row.rsFee ?? 0), 0),
    [rows],
  );
  const mismatchedCount = rows.filter((row) => row.channelStatus !== "matched").length;
  const payerReconciliations = useMemo(
    () => reconcileRedlockPayers(rows, actualPayers),
    [actualPayers, rows],
  );
  const missingPayers = payerReconciliations.flatMap((item) => item.missingPayers.map((payer) => ({ channelName: item.row.rsChannelName, payer })));
  const missingEmailPayers = payerReconciliations.flatMap((item) => item.missingEmailPayers.map((payer) => ({ channelName: item.row.rsChannelName, payer })));

  async function readFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setRows([]);
    setFileName(file.name);

    if (!/\.xlsx$/iu.test(file.name)) {
      setError("레드락 정산표는 .xlsx 파일만 입력할 수 있습니다.");
      return;
    }
    if (file.size < 1 || file.size > MAX_FILE_SIZE) {
      setError("파일 크기는 25MB 이하여야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      const sheets = await readXlsxFile(file) as unknown as Array<{ sheet: string; data: unknown[][] }>;
      const parsed = sheets.flatMap((sheet) => parseRedlockWorksheet({
        name: sheet.sheet,
        rows: sheet.data,
      } satisfies RedlockWorksheet, instructorName));
      setRows(checkRedlockChannels(parsed, actualChannels));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "레드락 엑셀을 읽지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!fileName) return;
    setRows((current) => checkRedlockChannels(current, actualChannels));
  }, [actualChannels, fileName]);

  function reset() {
    setRows([]);
    setFileName("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>레드락 엑셀 입력</DialogTitle>
          <DialogDescription>
            C열 강사명이 현재 정산 강사인 {instructorName || "미입력"}과 일치하는 행만 가져옵니다. 업로드 파일은 브라우저에서만 읽고 저장하지 않습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
          <div>
            <p className="font-medium">레드락 정산표</p>
            <p className="mt-1 text-sm text-muted-foreground">채널명과 RS 금액 열을 자동 인식해 실제 출연 채널과 대조합니다.</p>
          </div>
          <Input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => void readFile(event.currentTarget.files?.[0])}
          />
          <div className="flex gap-2">
            {fileName ? <Button type="button" variant="outline" disabled={loading} onClick={reset}>초기화</Button> : null}
            <Button type="button" disabled={loading} onClick={() => inputRef.current?.click()}>
              {loading ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              {fileName || "엑셀 선택"}
            </Button>
          </div>
        </div>

        {error ? <Alert variant="destructive"><XCircle /><AlertTitle>엑셀을 확인할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

        {fileName && !loading && !error ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">가져온 항목</p><p className="mt-1 text-xl font-semibold">{rows.length.toLocaleString("ko-KR")}건</p></div>
              <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">RS 수수료 합계</p><p className="mt-1 text-xl font-semibold tabular-nums">{won(totalFee)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">채널 확인 필요</p><p className="mt-1 text-xl font-semibold">{mismatchedCount.toLocaleString("ko-KR")}건</p></div>
              <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">실제 명단 미등록</p><p className="mt-1 text-xl font-semibold text-destructive">{missingPayers.length.toLocaleString("ko-KR")}명</p></div>
              <div className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">이메일 확인 필요</p><p className="mt-1 text-xl font-semibold">{missingEmailPayers.length.toLocaleString("ko-KR")}명</p></div>
            </div>

            {rows.length ? (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader><TableRow><TableHead>시트 · 행</TableHead><TableHead>강사</TableHead><TableHead>레드락 채널명</TableHead><TableHead>실제 RS 채널</TableHead><TableHead>대조</TableHead><TableHead className="text-right">RS 수수료</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const status = channelStatus[row.channelStatus];
                      return <TableRow key={`${row.sheetName}-${row.rowNumber}-${row.rsChannelName}`}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{row.sheetName} · {row.rowNumber}행</TableCell>
                        <TableCell>{row.instructorName}</TableCell>
                        <TableCell className="font-medium">{row.rsChannelName || "-"}</TableCell>
                        <TableCell>{row.matchedChannelName || "-"}</TableCell>
                        <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{won(row.rsFee)}</TableCell>
                      </TableRow>;
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <Alert><AlertTriangle /><AlertTitle>일치하는 강사 항목이 없습니다</AlertTitle><AlertDescription>C열의 강사명이 현재 정산 강사명과 같은 행만 표시합니다.</AlertDescription></Alert>
            )}
            {missingPayers.length ? (
              <div className="rounded-xl border border-destructive/30">
                <div className="border-b bg-destructive/5 px-4 py-3">
                  <p className="font-medium">실제 결제자 목록에 없는 명단</p>
                  <p className="mt-1 text-sm text-muted-foreground">이메일 기준으로 현재 강의의 결제자 목록에 없는 레드락 결제자입니다.</p>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>레드락 채널</TableHead><TableHead>이름</TableHead><TableHead>이메일</TableHead><TableHead>엑셀 행</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {missingPayers.map(({ channelName, payer }) => <TableRow key={`${channelName}-${payer.rowNumber}-${payer.email}`}>
                        <TableCell className="font-medium">{channelName || "-"}</TableCell>
                        <TableCell>{payer.name || "-"}</TableCell>
                        <TableCell>{payer.email}</TableCell>
                        <TableCell>{payer.rowNumber}행</TableCell>
                      </TableRow>)}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
            {missingEmailPayers.length ? (
              <Alert>
                <AlertTriangle />
                <AlertTitle>이메일이 없어 대조하지 못한 결제자가 있습니다</AlertTitle>
                <AlertDescription>{missingEmailPayers.map(({ channelName, payer }) => `${channelName || "채널 미입력"} · ${payer.name || `${payer.rowNumber}행`}`).join(", ")}</AlertDescription>
              </Alert>
            ) : null}
            {mismatchedCount === 0 && rows.length ? <Alert><CheckCircle2 /><AlertTitle>실제 RS 채널명과 모두 일치합니다</AlertTitle></Alert> : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

