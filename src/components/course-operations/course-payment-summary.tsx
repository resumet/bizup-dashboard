"use client";

import Link from "next/link";
import { Check, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseSettlementCheckbox, type CourseSettlementControls } from "./course-settlement-checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CoursePaymentSummary } from "@/lib/course-operations/payment-summary";

const money = (value: number) => `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원`;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function CoursePaymentSummaryTable({ summaries, savingIds, savedIds, onSave }: {
  summaries: CoursePaymentSummary[];
} & CourseSettlementControls) {
  const totalPaymentCount = summaries.reduce((sum, item) => sum + item.payment_count, 0);
  const totalPaymentAmount = summaries.reduce((sum, item) => sum + item.payment_amount, 0);
  const novaReceivable = summaries.reduce((sum, item) => {
    return sum + (!item.nova_settled ? item.payment_amount : 0);
  }, 0);
  const instructorPayable = summaries.reduce((sum, item) => {
    return sum + (!item.instructor_settled ? Math.max(0, (item.payment_amount - 45_000_000) / 2) : 0);
  }, 0);
  const balanceValue = 164_912_453;
  const netProfit = balanceValue + novaReceivable - instructorPayable;
  return (
    <div className="space-y-3">
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
                const saving = savingIds.has(item.id);
                return <TableRow key={item.id}>
                  <TableCell className="font-medium"><Link href={`/services/course-operations/students-settlements/${item.id}?tab=orders`} className="hover:underline">{item.name}</Link></TableCell>
                  <TableCell>{formatDate(item.free_webinar_at)}</TableCell>
                  <TableCell>{item.instructor_name || "-"}</TableCell>
                  <TableCell>{item.cohort ? `${item.cohort}기` : "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.payment_count.toLocaleString("ko-KR")}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(item.payment_amount)}</TableCell>
                  <TableCell><CourseSettlementCheckbox label={`${item.name} 노바 정산`} checked={item.nova_settled} saving={saving} onCheckedChange={(value) => void onSave(item.id, { novaSettled: value })} /></TableCell>
                  <TableCell><CourseSettlementCheckbox label={`${item.name} 강사 정산`} checked={item.instructor_settled} saving={saving} onCheckedChange={(value) => void onSave(item.id, { instructorSettled: value })} /></TableCell>
                  <TableCell className="text-right"><Button type="button" size="sm" variant="outline" onClick={() => void onSave(item.id, { novaSettled: item.nova_settled, instructorSettled: item.instructor_settled })} disabled={saving} aria-label={`${item.name} 정산 정보 저장`}>{saving ? <Loader2 className="animate-spin" /> : savedIds.has(item.id) ? <Check /> : <Save />}<span className="sr-only">저장</span></Button></TableCell>
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
