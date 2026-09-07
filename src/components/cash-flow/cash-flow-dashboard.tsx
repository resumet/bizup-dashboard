"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Landmark, Loader2, RefreshCw, Save, TrendingDown, TrendingUp, WalletCards } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { forecastCashFlow } from "@/lib/cash-flow/calculation";
import type { CashFlowCoursePlan, CashFlowDashboardData } from "@/lib/cash-flow/types";

const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("ko-KR");

function parseMoney(value: string, allowNegative = false) {
  const normalized = value.replace(/[^0-9-]/gu, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return allowNegative ? Math.round(parsed) : Math.max(0, Math.round(parsed));
}

function MoneyInput({ value, onChange, allowNegative = false, ariaLabel }: {
  value: number;
  onChange: (value: number) => void;
  allowNegative?: boolean;
  ariaLabel: string;
}) {
  return (
    <Input
      inputMode="numeric"
      value={number.format(value)}
      onChange={(event) => onChange(parseMoney(event.target.value, allowNegative))}
      aria-label={ariaLabel}
      className="text-right tabular-nums"
    />
  );
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function SummaryCard({ label, month, balance }: { label: string; month: string; balance: number }) {
  const negative = balance < 0;
  return (
    <Card className={negative ? "ring-destructive/40" : undefined}>
      <CardHeader className="pb-2">
        <CardDescription>{label} · {monthLabel(month)}</CardDescription>
        <CardTitle className={`text-2xl tabular-nums ${negative ? "text-destructive" : ""}`}>{won.format(balance)}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
        {negative ? <TrendingDown className="size-4 text-destructive" /> : <TrendingUp className="size-4 text-emerald-600" />}
        {negative ? "자금 부족 예상" : "잔액 유지 예상"}
      </CardContent>
    </Card>
  );
}

export function CashFlowDashboard({ initialData }: { initialData: CashFlowDashboardData }) {
  const [currentBalance, setCurrentBalance] = useState(initialData.currentBalance);
  const [monthlyFixedExpense, setMonthlyFixedExpense] = useState(initialData.monthlyFixedExpense);
  const [plans, setPlans] = useState(initialData.plans);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(initialData.loadError ?? "");
  const [notice, setNotice] = useState("");

  const forecast = useMemo(() => forecastCashFlow({
    startMonth: initialData.currentMonth,
    currentBalance,
    monthlyFixedExpense,
    plans,
    months: 13,
  }), [currentBalance, initialData.currentMonth, monthlyFixedExpense, plans]);
  const firstDeficit = forecast.find((item) => item.closingBalance < 0);
  const milestones = [
    { label: "이번 달 말", value: forecast[0] },
    { label: "3개월 후", value: forecast[3] },
    { label: "6개월 후", value: forecast[6] },
    { label: "12개월 후", value: forecast[12] },
  ];

  function patchPlan(courseId: string, patch: Partial<CashFlowCoursePlan>) {
    setPlans((current) => current.map((plan) => plan.courseId === courseId ? { ...plan, ...patch } : plan));
    setNotice("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/cash-flow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentBalance, monthlyFixedExpense, plans }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "저장하지 못했습니다.");
      setNotice("자금 설정과 강의별 계획을 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        <Button variant="ghost" size="sm" asChild className="mb-5">
          <Link href="/"><ArrowLeft />서비스 목록</Link>
        </Button>

        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <Badge variant="outline" className="mb-3"><WalletCards />회사 자금 관리</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">자금 흐름</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">현재 통장 잔액에 강의별 노바 입금·강사 지급과 매월 고정지출을 반영해 향후 12개월 잔액을 예측합니다.</p>
          </div>
          <Button onClick={save} disabled={saving || Boolean(initialData.loadError)} className="min-h-10">
            {saving ? <Loader2 className="animate-spin" /> : <Save />}변경사항 저장
          </Button>
        </div>

        {error ? <Alert variant="destructive" className="mt-6"><AlertTriangle /><AlertTitle>확인이 필요합니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {notice ? <Alert className="mt-6"><CheckCircle2 /><AlertTitle>저장 완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Landmark className="size-5" />현재 통장 잔액</CardTitle><CardDescription>오늘 기준 모든 회사 통장의 가용 잔액 합계</CardDescription></CardHeader>
            <CardContent><MoneyInput value={currentBalance} onChange={setCurrentBalance} allowNegative ariaLabel="현재 통장 잔액" /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>월 고정지출</CardTitle><CardDescription>급여·임차료·구독료 등 매월 기본적으로 지출되는 합계</CardDescription></CardHeader>
            <CardContent><MoneyInput value={monthlyFixedExpense} onChange={setMonthlyFixedExpense} ariaLabel="월 고정지출" /></CardContent>
          </Card>
        </section>

        <section className="mt-6">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">잔액 전망</h2>
            <p className="mt-1 text-sm text-muted-foreground">각 시점의 월말 예상 잔액입니다. 입력을 바꾸면 즉시 다시 계산됩니다.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {milestones.map((item) => <SummaryCard key={item.label} label={item.label} month={item.value.month} balance={item.value.closingBalance} />)}
          </div>
          <Alert className={`mt-4 ${firstDeficit ? "border-destructive/40" : "border-emerald-500/40"}`}>
            {firstDeficit ? <AlertTriangle className="text-destructive" /> : <CheckCircle2 className="text-emerald-600" />}
            <AlertTitle>{firstDeficit ? `${monthLabel(firstDeficit.month)}에 자금 부족이 예상됩니다.` : "향후 12개월 동안 예상 잔액이 0원 이상입니다."}</AlertTitle>
            <AlertDescription>{firstDeficit ? `예상 부족액은 ${won.format(Math.abs(firstDeficit.closingBalance))}입니다. 입금 시점 또는 지출 계획을 조정해 주세요.` : "등록된 강의 입출금과 월 고정지출을 기준으로 계산한 결과입니다."}</AlertDescription>
          </Alert>
        </section>

        <Card className="mt-6">
          <CardHeader><CardTitle>강의별 입출금 계획</CardTitle><CardDescription>정산 자료가 있으면 자동 계산값으로 시작합니다. 실제 입금·지급 예정액과 월은 직접 수정할 수 있습니다.</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead className="w-16 text-center">반영</TableHead><TableHead>강의 / 강사</TableHead><TableHead>예상 월</TableHead><TableHead className="text-right">노바 입금액</TableHead><TableHead className="text-right">강사 지급액</TableHead><TableHead>정산 연결</TableHead></TableRow></TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.courseId}>
                    <TableCell className="text-center"><input type="checkbox" checked={plan.isIncluded} onChange={(event) => patchPlan(plan.courseId, { isIncluded: event.target.checked })} aria-label={`${plan.courseName} 예측 반영`} className="size-4 accent-primary" /></TableCell>
                    <TableCell><Link href={`/services/course-operations/${plan.courseId}?tab=settlement`} className="font-medium hover:underline">{plan.courseName}</Link><p className="text-xs text-muted-foreground">{plan.instructorName}</p></TableCell>
                    <TableCell><Input type="month" value={plan.expectedMonth} onChange={(event) => patchPlan(plan.courseId, { expectedMonth: event.target.value })} aria-label={`${plan.courseName} 예상 월`} className="min-w-36" /></TableCell>
                    <TableCell><MoneyInput value={plan.novaInflow} onChange={(value) => patchPlan(plan.courseId, { novaInflow: value })} ariaLabel={`${plan.courseName} 노바 입금액`} /></TableCell>
                    <TableCell><MoneyInput value={plan.instructorPayout} onChange={(value) => patchPlan(plan.courseId, { instructorPayout: value })} ariaLabel={`${plan.courseName} 강사 지급액`} /></TableCell>
                    <TableCell>{plan.hasSettlement ? <Button type="button" size="sm" variant="outline" onClick={() => patchPlan(plan.courseId, { novaInflow: plan.autoNovaInflow, instructorPayout: plan.autoInstructorPayout })}><RefreshCw />최신 정산값 적용</Button> : <Badge variant="outline">정산 자료 없음</Badge>}</TableCell>
                  </TableRow>
                ))}
                {!plans.length ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">등록된 강의가 없습니다.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader><CardTitle>월별 자금 흐름</CardTitle><CardDescription>현재 월부터 12개월 후까지의 계산 내역입니다.</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>월</TableHead><TableHead className="text-right">월초 잔액</TableHead><TableHead className="text-right text-emerald-700">노바 입금</TableHead><TableHead className="text-right text-orange-700">강사 지급</TableHead><TableHead className="text-right">고정지출</TableHead><TableHead className="text-right">월 증감</TableHead><TableHead className="text-right">월말 잔액</TableHead></TableRow></TableHeader>
              <TableBody>{forecast.map((row) => <TableRow key={row.month}><TableCell className="font-medium">{monthLabel(row.month)}</TableCell><TableCell className="text-right tabular-nums">{won.format(row.openingBalance)}</TableCell><TableCell className="text-right tabular-nums text-emerald-700">+{won.format(row.novaInflow)}</TableCell><TableCell className="text-right tabular-nums text-orange-700">-{won.format(row.instructorPayout)}</TableCell><TableCell className="text-right tabular-nums">-{won.format(row.fixedExpense)}</TableCell><TableCell className={`text-right tabular-nums ${row.netChange < 0 ? "text-destructive" : "text-emerald-700"}`}>{row.netChange > 0 ? "+" : ""}{won.format(row.netChange)}</TableCell><TableCell className={`text-right font-semibold tabular-nums ${row.closingBalance < 0 ? "text-destructive" : ""}`}>{won.format(row.closingBalance)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
