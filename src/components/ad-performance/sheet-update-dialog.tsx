"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SheetUpdatePreview } from "@/lib/ad-performance/sheet-update";

const PAGE_SIZE = 50;
const display = (value: string | number | null) => value === null ? "—" : typeof value === "number" ? value.toLocaleString("ko-KR") : value;

export function SheetUpdateDialog({ preview, busy, error, cumulativeDbLabel = "누적비즈업 DB", onConfirm, onCancel }: {
  preview: SheetUpdatePreview;
  busy: boolean;
  error: string;
  cumulativeDbLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(preview.changes.length / PAGE_SIZE));
  return <Dialog open onOpenChange={open => { if (!open && !busy) onCancel(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-4xl" showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle>광고성과 변경 내역 확인</DialogTitle>
        <DialogDescription className="sr-only">날짜별 변경 전후 값을 확인하고 적용 여부를 선택합니다.</DialogDescription>
      </DialogHeader>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <p className="text-sm">
        {preview.changes.length
          ? `${new Set(preview.changes.map(change => change.date)).size.toLocaleString("ko-KR")}개 날짜 · ${preview.changes.length.toLocaleString("ko-KR")}개 항목이 변경됩니다.`
          : "변경되는 지표가 없습니다. 확인하면 원본 파일과 갱신 상태를 저장합니다."}
      </p>
      <p className="text-xs text-muted-foreground">신청 목록은 전체 내역을 기준으로 비교합니다. 과거 날짜의 증감과 누적 DB도 반영되므로, 일부 기간만 담긴 파일인지 확인해 주세요. 톡방 수동 입력값은 유지됩니다.</p>
      {preview.changes.length ? <div className="min-h-0 overflow-auto rounded-md border">
        <Table className="w-full table-fixed text-xs sm:text-sm">
          <TableHeader><TableRow><TableHead className="w-[24%]">날짜</TableHead><TableHead className="w-[36%]">항목</TableHead><TableHead className="w-[20%] text-right">변경 전</TableHead><TableHead className="w-[20%] text-right">변경 후</TableHead></TableRow></TableHeader>
          <TableBody>{preview.changes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((change, index) => <TableRow key={`${page}-${index}`}>
            <TableCell className="whitespace-normal">{change.date}</TableCell><TableCell className="whitespace-normal break-words">{change.field === "누적비즈업 DB" ? cumulativeDbLabel : change.field}</TableCell>
            <TableCell className="text-right whitespace-normal break-all tabular-nums">{display(change.before)}</TableCell><TableCell className="text-right font-semibold whitespace-normal break-all tabular-nums">{display(change.after)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div> : null}
      {pageCount > 1 ? <nav aria-label="변경 내역 페이지" className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage(value => value - 1)}>이전</Button>
        <span className="text-sm">{page + 1} / {pageCount}</span>
        <Button type="button" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage(value => value + 1)}>다음</Button>
      </nav> : null}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>취소</Button>
        <Button type="button" disabled={busy} onClick={onConfirm}>{busy ? <Loader2 className="animate-spin" /> : null}{busy ? "적용 중" : "확인 후 업데이트"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
