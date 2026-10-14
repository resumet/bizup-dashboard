"use client";

import { useEffect, useRef, useState } from "react";
import { GitCompareArrows, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhone } from "@/lib/jobs/filter";
import type { PaidStudentComparisonResponse } from "@/lib/course-operations/compare-paid-students";

type RosterOption = { id: string; name: string };
const PAGE_SIZE = 50;
const endpoint = "/api/course-operations/student-comparison";

export function StudentComparisonDialog() {
  const [open, setOpen] = useState(false);
  const [rosters, setRosters] = useState<RosterOption[]>([]);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PaidStudentComparisonResponse | null>(null);
  const [page, setPage] = useState(1);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function loadOptions() {
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setLoading(true); setError(""); setRosters([]);
    try {
      const response = await fetch(endpoint, { signal: request.signal, cache: "no-store" });
      const body = await response.json() as { rosters?: RosterOption[]; message?: string };
      if (!response.ok || !body.rosters) throw new Error(body.message || "명단을 불러오지 못했습니다.");
      if (!request.signal.aborted) setRosters(body.rosters);
    } catch (caught) {
      if (!request.signal.aborted) setError(caught instanceof Error ? caught.message : "명단을 불러오지 못했습니다.");
    } finally { if (!request.signal.aborted) setLoading(false); }
  }

  function changeOpen(nextOpen: boolean) {
    controller.current?.abort();
    setOpen(nextOpen); setLeftId(""); setRightId(""); setResult(null); setPage(1); setError(""); setComparing(false); setLoading(false);
    if (nextOpen) void loadOptions();
  }

  async function compare() {
    if (!leftId || !rightId || leftId === rightId) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    setComparing(true); setError(""); setResult(null); setPage(1);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leftId, rightId }), signal: request.signal,
      });
      const body = await response.json() as PaidStudentComparisonResponse & { message?: string };
      if (!response.ok) throw new Error(body.message || "명단 비교에 실패했습니다.");
      if (!request.signal.aborted) setResult(body);
    } catch (caught) {
      if (!request.signal.aborted) setError(caught instanceof Error ? caught.message : "명단 비교에 실패했습니다.");
    } finally { if (!request.signal.aborted) setComparing(false); }
  }

  const pageCount = Math.max(1, Math.ceil((result?.matches.length ?? 0) / PAGE_SIZE));
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><Button variant="outline"><GitCompareArrows />수강생 비교</Button></DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>수강생 비교</DialogTitle></DialogHeader>
      {loading ? <p role="status" className="flex items-center gap-2 py-4"><Loader2 className="size-4 animate-spin" />유료수강생 명단을 불러오는 중입니다.</p> : <>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["left", "right"] as const).map((side, index) => <div key={side} className="grid min-w-0 gap-2">
            <Label htmlFor={`compare-${side}`}>명단 {index + 1}</Label>
            <select id={`compare-${side}`} className="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
              value={side === "left" ? leftId : rightId} disabled={comparing || rosters.length < 2}
              onChange={event => { (side === "left" ? setLeftId : setRightId)(event.target.value); setResult(null); setPage(1); setError(""); }}>
              <option value="">유료수강생 명단을 선택하세요</option>
              {rosters.map(roster => <option key={roster.id} value={roster.id} disabled={roster.id === (side === "left" ? rightId : leftId)}>{roster.name}</option>)}
            </select>
          </div>)}
        </div>
        <p className="text-xs text-muted-foreground">유료수강생 탭에 저장된 최신 명단을 전화번호로 비교합니다. 같은 번호는 한 명으로 집계하고 환불자는 제외합니다. 결제자와 수강생이 다르면 실제 수강생을 비교합니다.</p>
        {rosters.length < 2 && !error && <p role="status" className="text-sm text-muted-foreground">비교하려면 서로 다른 강의에 저장된 유료수강생 명단이 두 개 이상 필요합니다.</p>}
      </>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-wrap justify-end gap-2">
        {error && rosters.length === 0 && <Button variant="outline" onClick={() => void loadOptions()} disabled={loading}>다시 불러오기</Button>}
        <Button variant="outline" onClick={() => changeOpen(false)}>닫기</Button>
        <Button onClick={() => void compare()} disabled={loading || comparing || !leftId || !rightId || leftId === rightId}>
          {comparing && <Loader2 className="animate-spin" />}{comparing ? "비교 중..." : "비교하기"}
        </Button>
      </div>
      {result && <div className="grid gap-3 border-t pt-4">
        <p role="status" className="font-semibold">중복 수강생 {result.matches.length.toLocaleString("ko-KR")}명</p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {(["left", "right"] as const).map((side, index) => <div key={side} className="min-w-0 rounded-md bg-muted/40 p-3">
            <p className="break-words">명단 {index + 1}: {result[side === "left" ? "leftRoster" : "rightRoster"].name}</p>
            <p className="mt-1 text-muted-foreground">저장 {result[side].rowCount.toLocaleString("ko-KR")}행 · 비교 {result[side].uniqueCount.toLocaleString("ko-KR")}명</p>
            {result[side].invalidPhoneCount > 0 && <p className="mt-1 text-muted-foreground">전화번호가 없거나 유효하지 않아 {result[side].invalidPhoneCount.toLocaleString("ko-KR")}행 제외</p>}
          </div>)}
        </div>
        {result.matches.length === 0 ? <p className="rounded-md border p-6 text-center text-sm">두 명단에 공통으로 포함된 수강생이 없습니다.</p> : <>
          <div className="max-h-[40vh] overflow-auto rounded-md border">
            <Table><TableHeader><TableRow><TableHead>전화번호</TableHead><TableHead>명단 1 이름</TableHead><TableHead>명단 1 이메일</TableHead><TableHead>명단 2 이름</TableHead><TableHead>명단 2 이메일</TableHead></TableRow></TableHeader>
              <TableBody>{result.matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(person => <TableRow key={person.phone}>
                <TableCell className="font-mono">{formatPhone(person.phone)}</TableCell>
                <TableCell>{person.left.names.join(" / ") || "-"}</TableCell><TableCell>{person.left.emails.join(" / ") || "-"}</TableCell>
                <TableCell>{person.right.names.join(" / ") || "-"}</TableCell><TableCell>{person.right.emails.join(" / ") || "-"}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
          {pageCount > 1 && <nav aria-label="중복 수강생 페이지" className="flex items-center justify-end gap-3 text-sm">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(current => current - 1)}>이전</Button>
            <span>{page} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page === pageCount} onClick={() => setPage(current => current + 1)}>다음</Button>
          </nav>}
        </>}
      </div>}
    </DialogContent>
  </Dialog>;
}
