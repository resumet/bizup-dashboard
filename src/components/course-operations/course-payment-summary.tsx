"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CoursePaymentSummary } from "@/lib/course-operations/payment-summary";

const money = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function CoursePaymentSummaryTable({ summaries }: { summaries: CoursePaymentSummary[] }) {
  const [drafts, setDrafts] = useState(() => new Map(summaries.map((item) => [item.id, {
    cohort: item.cohort,
    novaSettled: item.nova_settled,
    instructorSettled: item.instructor_settled,
  }])));
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const totalPaymentCount = summaries.reduce((sum, item) => sum + item.payment_count, 0);
  const totalPaymentAmount = summaries.reduce((sum, item) => sum + item.payment_amount, 0);
  const novaReceivable = summaries.reduce((sum, item) => {
    const draft = drafts.get(item.id);
    return sum + (!draft?.novaSettled ? item.payment_amount : 0);
  }, 0);
  const instructorPayable = summaries.reduce((sum, item) => {
    const draft = drafts.get(item.id);
    return sum + (!draft?.instructorSettled ? Math.max(0, (item.payment_amount - 45_000_000) / 2) : 0);
  }, 0);
  const balanceValue = 164_912_453;
  const netProfit = balanceValue + novaReceivable - instructorPayable;


  function updateDraft(id: string, patch: Partial<{ cohort: string; novaSettled: boolean; instructorSettled: boolean }>) {
    setDrafts((current) => {
      const next = new Map(current);
      next.set(id, { ...next.get(id)!, ...patch });
      return next;
    });
    setSavedId(null);
  }

  async function save(id: string, patch?: Partial<{ novaSettled: boolean; instructorSettled: boolean }>) {
    const draft = { ...drafts.get(id), ...patch };
    if (!draft || savingId) return;
    setSavingId(id); setSavedId(null); setError("");
    try {
      const response = await fetch(`/api/course-operations/${id}/payment-summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? "정산 정보를 저장하지 못했습니다.");
      setSavedId(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "정산 정보를 저장하지 못했습니다.");
    } finally { setSavingId(null); }
  }

  return (
    <div className="space-y-3">
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-[1080px]">
            <TableHeader><TableRow>
              <TableHead>강의 제목</TableHead><TableHead>무료웨비나 날짜</TableHead><TableHead>강사명</TableHead>
              <TableHead>기수</TableHead><TableHead className="text-right">결제 건수</TableHead>
              <TableHead className="text-right">전체 결제금액</TableHead><TableHead>노바 정산</TableHead>
              <TableHead>강사 정산</TableHead><TableHead className="text-right">저장</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell>전체 합계</TableCell>
                <TableCell colSpan={3}>-</TableCell>
                <TableCell className="text-right tabular-nums">{totalPaymentCount.toLocaleString("ko-KR")}</TableCell>
                <TableCell className="text-right tabular-nums">{money(totalPaymentAmount)}</TableCell>
                <TableCell colSpan={3}>-</TableCell>
              </TableRow>
              {summaries.map((item) => {
                const draft = drafts.get(item.id)!;
                const saving = savingId === item.id;
                return <TableRow key={item.id}>
                  <TableCell className="font-medium"><Link href={`/services/course-operations/${item.id}`} className="hover:underline">{item.name}</Link></TableCell>
                  <TableCell>{formatDate(item.free_webinar_at)}</TableCell>
                  <TableCell>{item.instructor_name || "-"}</TableCell>
                  <TableCell>{item.cohort ? `${item.cohort}기` : "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.payment_count.toLocaleString("ko-KR")}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(item.payment_amount)}</TableCell>
                  <TableCell><label className="inline-flex items-center gap-2 text-sm"><Checkbox checked={draft.novaSettled} onCheckedChange={(checked) => { const value = checked === true; updateDraft(item.id, { novaSettled: value }); void save(item.id, { novaSettled: value }); }} />{draft.novaSettled ? <Badge variant="default">완료</Badge> : <Badge variant="outline">미정산</Badge>}</label></TableCell>
                  <TableCell><label className="inline-flex items-center gap-2 text-sm"><Checkbox checked={draft.instructorSettled} onCheckedChange={(checked) => { const value = checked === true; updateDraft(item.id, { instructorSettled: value }); void save(item.id, { instructorSettled: value }); }} />{draft.instructorSettled ? <Badge variant="default">완료</Badge> : <Badge variant="outline">미정산</Badge>}</label></TableCell>
                  <TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => void save(item.id)} disabled={saving} aria-label={`${item.name} 정산 정보 저장`}>{saving ? <Loader2 className="animate-spin" /> : savedId === item.id ? <Check /> : <Save />}<span className="sr-only">저장</span></Button></TableCell>
                </TableRow>;
              })}
              {!summaries.length ? <TableRow><TableCell colSpan={9} className="h-32 text-center text-muted-foreground">등록된 강의가 없습니다.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-sm text-muted-foreground">노바에서 받을 돈</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(novaReceivable)}</p></div>
          <div><p className="text-sm text-muted-foreground">강사에게 줄 돈</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(instructorPayable)}</p></div>
          <div><p className="text-sm text-muted-foreground">현재 통장 잔액</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(balanceValue)}</p></div>
          <div><p className="text-sm text-muted-foreground">현재까지 순이익</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(netProfit)}</p></div>
        </div>
    </div>
  );
}
