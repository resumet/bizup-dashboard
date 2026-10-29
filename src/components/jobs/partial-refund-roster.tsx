"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { partialRefundRosterAmounts } from "@/lib/jobs/partial-refund";
import type { RosterRow } from "@/lib/jobs/types";

const money = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;

export function PartialRefundRoster({ rows }: { rows: RosterRow[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const keyword = query.trim().toLocaleLowerCase("ko-KR");
  const filtered = rows.filter((row) => [
    row.values.customerName,
    row.normalizedPhone,
    row.values.email,
    row.values.optionName,
  ].some((value) => value?.toLocaleLowerCase("ko-KR").includes(keyword)));
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const current = Math.min(page, pages);

  return <details className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 dark:border-blue-900 dark:bg-blue-950/20">
    <summary className="cursor-pointer font-semibold text-blue-900 dark:text-blue-100">부분환불자 · {rows.length.toLocaleString("ko-KR")}명</summary>
    <p className="my-3 text-sm text-muted-foreground">부분환불 후 남은 매출이 있는 유료수강생입니다. 매출금액은 주문금액에서 환불금액을 뺀 금액입니다.</p>
    <Input aria-label="부분환불자 검색" placeholder="이름·전화번호·이메일·옵션 검색" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
    <div className="overflow-x-auto">
      <Table><TableHeader><TableRow>{["이름", "전화번호", "이메일", "옵션", "주문금액", "환불금액", "매출금액"].map((label) => <TableHead key={label} className={label.endsWith("금액") ? "text-right" : ""}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{filtered.slice((current - 1) * 50, current * 50).map((row) => {
          const amounts = partialRefundRosterAmounts(row);
          return <TableRow key={row.id}>
            <TableCell>{row.values.customerName || "-"}</TableCell>
            <TableCell>{row.normalizedPhone || "-"}</TableCell>
            <TableCell>{row.values.email || "-"}</TableCell>
            <TableCell>{row.values.optionName || "-"}</TableCell>
            <TableCell className="text-right tabular-nums">{money(amounts.originalAmount)}</TableCell>
            <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-300">{money(amounts.refundAmount)}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums text-blue-700 dark:text-blue-300">{money(amounts.revenueAmount)}</TableCell>
          </TableRow>;
        })}</TableBody></Table>
    </div>
    {!filtered.length ? <p className="py-4 text-sm text-muted-foreground">조회할 부분환불자가 없습니다.</p> : null}
    {pages > 1 ? <div className="mt-3 flex items-center gap-3"><Button variant="outline" disabled={current === 1} onClick={() => setPage(current - 1)}>이전</Button><span>{current} / {pages}</span><Button variant="outline" disabled={current === pages} onClick={() => setPage(current + 1)}>다음</Button></div> : null}
  </details>;
}
