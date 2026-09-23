"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, Download, Landmark, Loader2, Printer, ReceiptText, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { CourseCost, CourseCostBurden } from "@/lib/course-costs/types";
import { calculateCostSettlement, roundWon, type AggregatedInstructorSettlement, type MonthlyAnalysis, type SettlementCost } from "@/lib/course-settlements/engine";
import { escapePrintHtml } from "@/lib/course-settlements/print";
import { printStatementWithStudents } from "@/lib/course-settlements/print-students";
import { createSettlementStatementDraft, type SettlementStatementDraft } from "@/lib/course-settlements/statement";

const ISSUER = "주식회사 비즈업클래스";
const currency = (value: number) => `${roundWon(value).toLocaleString("ko-KR")}원`;

type CalculationRow = { code: string; label: string; value: number; formula: string; emphasized?: boolean };

function SummaryMetric({ label, value, unit = "원", tone = "default" }: {
  label: string;
  value: number;
  unit?: "원" | "건" | "명";
  tone?: "default" | "primary" | "instructor";
}) {
  const toneClass = tone === "primary"
    ? "border-blue-200 bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg shadow-blue-950/10"
    : tone === "instructor"
      ? "border-emerald-200 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-950/10"
      : "border-border/70 bg-card";
  const labelClass = tone === "default" ? "text-muted-foreground" : "text-white/75";
  return (
    <div className={`min-w-0 rounded-2xl border p-5 ${toneClass}`}>
      <p className={`text-xs font-semibold tracking-[0.12em] ${labelClass}`}>{label}</p>
      <p className="mt-3 break-all text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
        {roundWon(value).toLocaleString("ko-KR")}<span className="ml-1 text-sm font-medium opacity-75">{unit}</span>
      </p>
    </div>
  );
}

function CompanyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[5.5rem_1fr] gap-3 border-t border-border/60 py-2.5 first:border-t-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium">{value || "-"}</dd>
    </div>
  );
}

function CostTable({ title, description, burden, costs }: {
  title: string;
  description: string;
  burden: CourseCostBurden;
  costs: CourseCost[];
}) {
  const rows = costs.filter((cost) => cost.burdenType === burden);
  const total = rows.reduce((sum, cost) => sum + cost.grossAmount, 0);
  return (
    <section className="overflow-hidden rounded-xl border border-border/70">
      <div className="flex flex-wrap items-end justify-between gap-3 bg-muted/40 px-4 py-3.5">
        <div><h3 className="font-semibold">{title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>
        <Badge variant="secondary">{rows.length.toLocaleString("ko-KR")}건</Badge>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead className="w-[50%] px-4">비용명</TableHead><TableHead className="w-[25%]">담당자</TableHead><TableHead className="w-[25%] pr-4 text-right">금액</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.length ? rows.map((cost) => (
            <TableRow key={cost.id}>
              <TableCell className="px-4 font-medium">{cost.name}</TableCell>
              <TableCell className="text-muted-foreground">{cost.managerName || "-"}</TableCell>
              <TableCell className="pr-4 text-right font-medium tabular-nums">{currency(cost.grossAmount)}</TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={3} className="h-20 text-center text-muted-foreground">정산에 반영된 비용이 없습니다.</TableCell></TableRow>}
        </TableBody>
        <TableFooter><TableRow><TableCell colSpan={2} className="px-4 font-semibold">{title} 총합</TableCell><TableCell className="pr-4 text-right text-base font-bold tabular-nums">{currency(total)}</TableCell></TableRow></TableFooter>
      </Table>
    </section>
  );
}

function toSettlementCost(cost: CourseCost): SettlementCost {
  return {
    id: cost.id,
    name: cost.name,
    burden: cost.burdenType === "INSTRUCTOR" ? "instructor" : cost.burdenType === "SHARED" ? "shared" : "company",
    manager: cost.managerName,
    amount: cost.grossAmount,
    occurredOn: cost.paidDate,
    note: cost.note,
    evidenceRequired: cost.evidenceRequired,
    evidenceType: "기타",
    evidenceNeedsReview: cost.evidenceNeedsReview,
    attachments: cost.attachments.map((file) => ({ id: file.id, name: file.originalName, type: file.mimeType, size: file.size, url: file.url })),
    companyShareAmount: cost.companyShareAmount,
    instructorShareAmount: cost.instructorShareAmount,
  };
}

function printCostSection(title: string, burden: CourseCostBurden, costs: CourseCost[]) {
  const rows = costs.filter((cost) => cost.burdenType === burden);
  const total = rows.reduce((sum, cost) => sum + cost.grossAmount, 0);
  const body = rows.length
    ? rows.map((cost) => `<tr><td>${escapePrintHtml(cost.name)}</td><td>${escapePrintHtml(cost.managerName || "-")}</td><td class="number">${currency(cost.grossAmount)}</td></tr>`).join("")
    : '<tr><td colspan="3" class="empty">정산에 반영된 비용이 없습니다.</td></tr>';
  return `<section class="cost-section"><div class="section-heading"><h3>${title}</h3><span>${rows.length.toLocaleString("ko-KR")}건</span></div><table><thead><tr><th>비용명</th><th>담당자</th><th class="number">금액</th></tr></thead><tbody>${body}</tbody><tfoot><tr class="total"><td colspan="2">${title} 총합</td><td class="number">${currency(total)}</td></tr></tfoot></table></section>`;
}

export function SettlementStatement({ instructor, monthlyAnalyses, courseId, courseName, courseCosts, appliedCourseCosts, costsAreSnapshot, draft: savedDraft, onChange, onSave, onConfirm, onReopen, busy }: {
  instructor: AggregatedInstructorSettlement;
  monthlyAnalyses: MonthlyAnalysis[];
  courseId: string;
  courseName: string;
  courseCosts: CourseCost[];
  appliedCourseCosts: CourseCost[];
  costsAreSnapshot: boolean;
  draft?: SettlementStatementDraft;
  onChange: (draft: SettlementStatementDraft) => void;
  onSave: (draft: SettlementStatementDraft) => Promise<SettlementStatementDraft>;
  onConfirm: (draft: SettlementStatementDraft) => Promise<SettlementStatementDraft>;
  onReopen: () => Promise<void>;
  busy: boolean;
}) {
  const draft = savedDraft ?? createSettlementStatementDraft(courseName);
  const confirmed = Boolean(draft.confirmedAt);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [printing, setPrinting] = useState(false);
  const settlementCosts = useMemo(() => appliedCourseCosts.map(toSettlementCost), [appliedCourseCosts]);
  const calculation = useMemo(() => calculateCostSettlement({
    totalSales: instructor.totalSales,
    pgFee: instructor.pgFee,
    novaFee: instructor.systemNovaFee,
    costs: settlementCosts,
    instructorRatioPercent: draft.instructorRatioPercent,
  }), [draft.instructorRatioPercent, instructor.pgFee, instructor.systemNovaFee, instructor.totalSales, settlementCosts]);
  const transactionMetrics = useMemo(() => {
    const payers = new Set<string>();
    let paymentCount = 0;
    let refundCount = 0;
    for (const month of monthlyAnalyses) {
      const source = month.detailsByInstructor[instructor.instructor];
      if (!source) continue;
      for (const row of source.toss) {
        if (row.buyer) payers.add(`name:${row.buyer}`);
        paymentCount += 1;
        if (row.amount < 0 || row.status.includes("취소")) refundCount += 1;
      }
      for (const row of source.cash) {
        const payer = row.email || row.phone || row.buyer;
        if (payer) payers.add(`cash:${payer}`);
        paymentCount += 1;
        if (row.cancellationAmount !== 0) refundCount += 1;
      }
    }
    return { payerCount: payers.size, paymentCount, refundCount };
  }, [instructor.instructor, monthlyAnalyses]);
  const defaultInstructorShared = roundWon(calculation.costs.shared * calculation.instructorRatioPercent / 100);
  const sharedInstructorAdjustment = calculation.costs.sharedInstructor - defaultInstructorShared;
  const sharedCompanyAdjustment = calculation.costs.sharedCompany - (calculation.costs.shared - defaultInstructorShared);
  const calculationRows: CalculationRow[] = [
    { code: "A", label: "전체 매출", value: calculation.totalSales, formula: "원본 결제 매출 합계" },
    { code: "B", label: "PG 수수료", value: calculation.pgFee, formula: "결제대행사 수수료 합계" },
    { code: "C", label: "노바 수수료", value: calculation.novaFee, formula: "시스템 노바 수수료 합계" },
    { code: "D", label: "정산대상 매출", value: calculation.settlementTargetRevenue, formula: "A − B − C" },
    { code: "E", label: "공동 부담액", value: calculation.costs.shared, formula: "공동 부담 비용 총합" },
    { code: "F", label: "분배 기준액", value: calculation.distributionBase, formula: "D − E" },
    { code: "G", label: "강사 기본분", value: calculation.instructorBase, formula: `F × ${calculation.instructorRatioPercent}%` },
    { code: "H", label: "강사 부담액", value: calculation.costs.instructor, formula: "강사 단독 부담 비용 총합" },
    { code: "I", label: "공동비용 강사 조정액", value: sharedInstructorAdjustment, formula: `공동비용 강사 부담액 − (E × ${calculation.instructorRatioPercent}%)` },
    { code: "J", label: "강사 공급가액", value: calculation.instructorSupply, formula: "G − H − I" },
    { code: "K", label: "부가세", value: calculation.vat, formula: "J × 10%" },
    { code: "L", label: "최종 강사 지급액", value: calculation.instructorFinal, formula: "J + K", emphasized: true },
    { code: "M", label: "회사 기본분", value: calculation.companyBase, formula: `F × ${calculation.companyRatioPercent}%` },
    { code: "N", label: "회사 부담액", value: calculation.costs.company, formula: "회사 단독 부담 비용 총합" },
    { code: "O", label: "공동비용 회사 조정액", value: sharedCompanyAdjustment, formula: `공동비용 회사 부담액 − (E × ${calculation.companyRatioPercent}%)` },
    { code: "P", label: "최종 회사분", value: calculation.companyFinal, formula: "M − N − O", emphasized: true },
  ];
  const missingEvidence = appliedCourseCosts.filter((cost) => cost.evidenceRequired && cost.attachments.length === 0);
  const targetCompanyName = draft.recipientCompanyName || instructor.instructor;
  const patchDraft = (patch: Partial<SettlementStatementDraft>) => onChange({ ...draft, ...patch });

  async function run(action: () => Promise<SettlementStatementDraft>, success: string) {
    setError(""); setNotice("");
    try { onChange(await action()); setNotice(success); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다."); }
  }

  function downloadDraft() {
    const payload = { kind: "bizup-course-settlement", version: 3, savedAt: new Date().toISOString(), issuer: ISSUER, instructor, draft, costs: appliedCourseCosts, ledgerCosts: courseCosts, calculation };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${instructor.instructor}_정산정보.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function printStatement() {
    if (!draft.lectureName.trim() || !draft.coursePeriod.trim() || !draft.settlementPeriod.trim() || !draft.manager.trim()) {
      setError("PDF 출력 전에 강의명, 강의기간, 정산기간, 담당자를 모두 입력해 주세요.");
      return;
    }
    const companyInformation = `<div class="company-grid"><section class="company-card"><div class="company-title"><span>TO</span><strong>정산 대상 회사</strong></div><dl><dt>회사/사업자명</dt><dd>${escapePrintHtml(targetCompanyName)}</dd><dt>대표자</dt><dd>${escapePrintHtml(draft.recipientRepresentative || instructor.instructor)}</dd><dt>사업자등록번호</dt><dd>${escapePrintHtml(draft.recipientBusinessNumber || "-")}</dd><dt>연락처</dt><dd>${escapePrintHtml(draft.recipientContact || "-")}</dd></dl></section><section class="company-card issuer"><div class="company-title"><span>FROM</span><strong>비즈업클래스 회사 정보</strong></div><dl><dt>회사명</dt><dd>${ISSUER}</dd><dt>대표자</dt><dd>${escapePrintHtml(draft.issuerRepresentative || "-")}</dd><dt>사업자등록번호</dt><dd>${escapePrintHtml(draft.issuerBusinessNumber || "-")}</dd><dt>연락처</dt><dd>${escapePrintHtml(draft.issuerContact || "-")}</dd></dl></section></div>`;
    const primarySummary = `<div class="summary-grid"><div class="summary-card primary"><span>전체 매출</span><strong>${currency(calculation.totalSales)}</strong></div><div class="summary-card"><span>공동 부담액</span><strong>${currency(calculation.costs.shared)}</strong></div><div class="summary-card success"><span>최종 강사 지급액</span><strong>${currency(calculation.instructorFinal)}</strong></div></div>`;
    const countSummary = `<div class="metric-grid"><div><span>전체 결제자 수</span><strong>${transactionMetrics.payerCount.toLocaleString("ko-KR")}명</strong></div><div><span>결제 건수</span><strong>${transactionMetrics.paymentCount.toLocaleString("ko-KR")}건</strong></div><div><span>환불 건수</span><strong>${transactionMetrics.refundCount.toLocaleString("ko-KR")}건</strong></div></div>`;
    const costs = [printCostSection("공동 부담액", "SHARED", appliedCourseCosts), printCostSection("회사 부담액", "COMPANY", appliedCourseCosts), printCostSection("강사 부담액", "INSTRUCTOR", appliedCourseCosts)].join("");
    const flow = calculationRows.map((row) => `<tr${row.emphasized ? ' class="highlight"' : ""}><td class="code">${row.code}</td><th>${row.label}</th><td class="number">${currency(row.value)}</td><td class="formula">${escapePrintHtml(row.formula)}</td></tr>`).join("");
    const body = `<header class="document-header"><div><p class="eyebrow">BIZUP CLASS · SETTLEMENT</p><h1>${escapePrintHtml(draft.lectureName)} 최종 정산서</h1><p class="meta">강의기간 ${escapePrintHtml(draft.coursePeriod)} · 정산기간 ${escapePrintHtml(draft.settlementPeriod)} · 발행일 ${escapePrintHtml(draft.issueDate)} · 담당자 ${escapePrintHtml(draft.manager)}</p></div><div class="document-status">${escapePrintHtml(draft.status)}</div></header>${companyInformation}<h2>정산 요약</h2>${primarySummary}${countSummary}<h2>비용 상세</h2>${costs}<h2>최종 정산 계산</h2><p class="section-description">항목 코드를 기준으로 각 계산식의 연결 관계를 확인할 수 있습니다.</p><table class="calculation-table"><thead><tr><th class="code">코드</th><th>항목</th><th class="number">금액</th><th>계산식</th></tr></thead><tbody>${flow}</tbody></table>`;
    setError("");
    setPrinting(true);
    try { await printStatementWithStudents(`${draft.lectureName.replace(/[\\/:*?"<>|]/gu, "_")}_최종_정산서`, body, courseId); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "정산서 인쇄 창을 열지 못했습니다. 다시 시도해 주세요."); }
    finally { setPrinting(false); }
  }

  const inputFields: Array<{ label: string; key: keyof SettlementStatementDraft; placeholder: string; required?: boolean }> = [
    { label: "정산 대상 회사/사업자명", key: "recipientCompanyName", placeholder: instructor.instructor },
    { label: "대표자", key: "recipientRepresentative", placeholder: instructor.instructor },
    { label: "사업자등록번호", key: "recipientBusinessNumber", placeholder: "000-00-00000" },
    { label: "연락처 또는 이메일", key: "recipientContact", placeholder: "010-0000-0000 / email@example.com" },
    { label: "비즈업 대표자", key: "issuerRepresentative", placeholder: "대표자명" },
    { label: "비즈업 사업자등록번호", key: "issuerBusinessNumber", placeholder: "000-00-00000" },
    { label: "비즈업 연락처", key: "issuerContact", placeholder: "전화번호 / 이메일" },
    { label: "강의명", key: "lectureName", placeholder: "", required: true },
    { label: "강의기간", key: "coursePeriod", placeholder: "", required: true },
    { label: "정산기간", key: "settlementPeriod", placeholder: "", required: true },
    { label: "비즈업 정산 담당자", key: "manager", placeholder: "", required: true },
  ];

  return (
    <div className="space-y-5">
      {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert><CheckCircle2 /><AlertTitle>처리 완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}

      <Card className="border-blue-200/70 bg-gradient-to-br from-blue-50/80 via-background to-indigo-50/60 dark:border-blue-900/50 dark:from-blue-950/30 dark:to-indigo-950/20">
        <CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 text-xs font-semibold tracking-[0.18em] text-blue-600">BIZUP CLASS · SETTLEMENT</p><CardTitle className="text-xl sm:text-2xl">{draft.lectureName} 최종 정산서</CardTitle><CardDescription className="mt-1">지급 완료된 비용과 정산 데이터를 한 문서로 정리합니다.</CardDescription></div><div className="flex flex-wrap gap-2"><Badge variant={confirmed ? "default" : "outline"}>{draft.status}</Badge>{costsAreSnapshot ? <Badge variant="secondary">확정 스냅샷</Badge> : null}</div></div></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border bg-background/90 p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><div className="rounded-lg bg-blue-100 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><Building2 className="size-4" /></div><div><p className="text-xs font-semibold tracking-wide text-blue-600">TO</p><h3 className="font-semibold">정산 대상 회사</h3></div></div><dl><CompanyField label="회사/사업자명" value={targetCompanyName} /><CompanyField label="대표자" value={draft.recipientRepresentative || instructor.instructor} /><CompanyField label="사업자번호" value={draft.recipientBusinessNumber} /><CompanyField label="연락처" value={draft.recipientContact} /></dl></section>
          <section className="rounded-xl border bg-background/90 p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><div className="rounded-lg bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><Landmark className="size-4" /></div><div><p className="text-xs font-semibold tracking-wide text-indigo-600">FROM</p><h3 className="font-semibold">비즈업클래스 회사 정보</h3></div></div><dl><CompanyField label="회사명" value={ISSUER} /><CompanyField label="대표자" value={draft.issuerRepresentative} /><CompanyField label="사업자번호" value={draft.issuerBusinessNumber} /><CompanyField label="연락처" value={draft.issuerContact} /></dl></section>
        </CardContent>
      </Card>

      <section aria-label="핵심 정산 요약" className="grid gap-4 md:grid-cols-3"><SummaryMetric label="전체 매출" value={calculation.totalSales} tone="primary" /><SummaryMetric label="공동 부담액" value={calculation.costs.shared} /><SummaryMetric label="최종 강사 지급액" value={calculation.instructorFinal} tone="instructor" /></section>
      <section aria-label="결제 현황" className="grid gap-4 sm:grid-cols-3"><SummaryMetric label="전체 결제자 수" value={transactionMetrics.payerCount} unit="명" /><SummaryMetric label="결제 건수" value={transactionMetrics.paymentCount} unit="건" /><SummaryMetric label="환불 건수" value={transactionMetrics.refundCount} unit="건" /></section>

      <Card><CardHeader><CardTitle>정산서 정보</CardTitle><CardDescription>상단 회사 정보와 문서 발행에 사용할 내용을 입력하세요.</CardDescription></CardHeader><CardContent className="grid gap-x-4 gap-y-5 md:grid-cols-2 lg:grid-cols-4">
        {inputFields.map(({ label, key, placeholder, required }) => <div className="space-y-2" key={key}><Label>{label}{required ? " *" : ""}</Label><Input disabled={confirmed} value={String(draft[key])} placeholder={placeholder} onChange={(event) => patchDraft({ [key]: event.target.value })} /></div>)}
        <div className="space-y-2"><Label>발행일</Label><Input disabled={confirmed} type="date" value={draft.issueDate} onChange={(event) => patchDraft({ issueDate: event.target.value })} /></div>
        <div className="space-y-2"><Label>강사 배분율 (%)</Label><Input disabled={confirmed} type="number" min="0" max="100" step="0.1" value={draft.instructorRatioPercent} onChange={(event) => patchDraft({ instructorRatioPercent: Number(event.target.value) })} /></div>
      </CardContent></Card>

      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>비용 상세</CardTitle><CardDescription>정산에 반영된 지급 완료 비용을 부담 주체별로 구분했습니다.</CardDescription></div><Button asChild variant="outline"><Link href={`/services/course-operations/${courseId}?tab=costs`}>비용 관리로 이동</Link></Button></div></CardHeader><CardContent className="space-y-4">
        <CostTable title="공동 부담액" description="회사와 강사가 설정 비율로 함께 부담" burden="SHARED" costs={appliedCourseCosts} />
        <CostTable title="회사 부담액" description="회사 단독 부담 비용" burden="COMPANY" costs={appliedCourseCosts} />
        <CostTable title="강사 부담액" description="강사 단독 부담 비용" burden="INSTRUCTOR" costs={appliedCourseCosts} />
      </CardContent></Card>

      <Card><CardHeader><div className="flex items-center gap-3"><div className="rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><ReceiptText className="size-5" /></div><div><CardTitle>최종 정산 계산</CardTitle><CardDescription>각 항목의 코드를 수식에 연결해 계산 흐름을 확인할 수 있습니다.</CardDescription></div></div></CardHeader><CardContent className="space-y-5">
        <div className="overflow-hidden rounded-xl border"><Table><TableHeader className="bg-muted/50"><TableRow><TableHead className="w-16 px-4 text-center">코드</TableHead><TableHead>항목</TableHead><TableHead className="text-right">금액</TableHead><TableHead className="min-w-52 px-4">계산식</TableHead></TableRow></TableHeader><TableBody>{calculationRows.map((row) => <TableRow key={row.code} className={row.emphasized ? "bg-blue-50/70 dark:bg-blue-950/20" : ""}><TableCell className="px-4 text-center"><span className={`inline-flex size-8 items-center justify-center rounded-lg font-bold ${row.emphasized ? "bg-blue-600 text-white" : "bg-muted text-foreground"}`}>{row.code}</span></TableCell><TableCell className={row.emphasized ? "font-bold" : "font-medium"}>{row.label}</TableCell><TableCell className={`text-right tabular-nums ${row.emphasized ? "text-base font-bold text-blue-700 dark:text-blue-300" : "font-medium"}`}>{currency(row.value)}</TableCell><TableCell className="px-4 font-mono text-xs text-muted-foreground">{row.formula}</TableCell></TableRow>)}</TableBody></Table></div>
        {missingEvidence.length ? <Alert variant="destructive"><AlertTriangle /><AlertTitle>필수 증빙 미등록 {missingEvidence.length}건</AlertTitle><AlertDescription>{missingEvidence.map((cost) => cost.name).join(", ")}</AlertDescription></Alert> : null}
        {!confirmed ? <div><Label>예외 확정 사유</Label><Textarea className="mt-2" placeholder="필수 증빙 없이 확정해야 하는 사유를 기록하세요." value={draft.exceptionReason} onChange={(event) => patchDraft({ exceptionReason: event.target.value })} /></div> : draft.exceptionReason ? <Alert><AlertTitle>예외 확정 사유</AlertTitle><AlertDescription>{draft.exceptionReason}</AlertDescription></Alert> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-5">
          {!confirmed ? <Button variant="outline" onClick={() => void run(() => onSave(draft), "정산 정보를 저장했습니다.")} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />}정산 정보 저장</Button> : null}
          <Button variant="outline" onClick={downloadDraft}><Download />JSON 저장</Button>
          <Button variant="outline" disabled={printing} onClick={() => void printStatement()}>{printing ? <Loader2 className="animate-spin" /> : <Printer />}정산서 인쇄/PDF</Button>
          {confirmed ? <Button variant="outline" disabled={busy} onClick={() => void onReopen()}>{busy ? <Loader2 className="animate-spin" /> : null}정산 확정 취소</Button> : <Button disabled={busy} onClick={() => void run(() => onConfirm(draft), "정산서를 확정했습니다.")}>{busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}정산 확정</Button>}
        </div>
      </CardContent></Card>
    </div>
  );
}
