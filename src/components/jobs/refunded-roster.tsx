"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { refundDate } from "@/lib/jobs/refund";
import type { RosterRow } from "@/lib/jobs/types";

export function RefundedRoster({ rows }: { rows: (RosterRow & { sourceJobName?: string })[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const filtered = rows.filter((row) => [row.values.customerName, row.normalizedPhone, row.values.email, row.sourceJobName].some((value) => value?.toLowerCase().includes(query.trim().toLowerCase())));
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const current = Math.min(page, pages);
  return <details className="rounded-lg border bg-muted/30 p-4">
    <summary className="cursor-pointer font-semibold">환불자 명단 · {rows.length.toLocaleString("ko-KR")}명 (조회 전용)</summary>
    <p className="my-3 text-sm text-muted-foreground">환불자는 명단 비교·중복 검사·발송 대상에서 제외됩니다.</p>
    <Input aria-label="환불자 검색" placeholder="이름·전화번호·이메일·명단명 검색" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
    <Table><TableHeader><TableRow>{["이름", "전화번호", "이메일", "명단", "옵션", "환불 표시일", "비고"].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{filtered.slice((current - 1) * 50, current * 50).map((row) => <TableRow key={row.id}>
        <TableCell>{row.values.customerName || "-"}</TableCell><TableCell>{row.normalizedPhone}</TableCell><TableCell>{row.values.email || "-"}</TableCell><TableCell>{row.sourceJobName || row.values.courseName || "-"}</TableCell><TableCell>{row.values.optionName || "-"}</TableCell><TableCell>{refundDate(row.values) ? new Date(refundDate(row.values)!).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-"}</TableCell><TableCell>{row.memo || "-"}</TableCell>
      </TableRow>)}</TableBody></Table>
    {!filtered.length ? <p className="py-4 text-sm text-muted-foreground">조회할 환불자가 없습니다.</p> : null}
    {pages > 1 ? <div className="mt-3 flex items-center gap-3"><Button variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)}>이전</Button><span>{current} / {pages}</span><Button variant="outline" disabled={current === pages} onClick={() => setPage(current + 1)}>다음</Button></div> : null}
  </details>;
}
