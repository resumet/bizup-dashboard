"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Printer, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CourseCost } from "@/lib/course-costs/types";
import { calculateCostSettlement, roundWon, type AggregatedInstructorSettlement, type MonthlyAnalysis, type SettlementCost } from "@/lib/course-settlements/engine";
import { escapePrintHtml, printHtmlDocument } from "@/lib/course-settlements/print";
import { createSettlementStatementDraft, type SettlementStatementDraft } from "@/lib/course-settlements/statement";

const ISSUER = "주식회사 비즈업클래스";
const burdenLabel = { COMPANY: "회사 부담", INSTRUCTOR: "강사 부담", SHARED: "공동 부담", UNCLASSIFIED: "미분류" } as const;
const costStatusLabel = { PLANNED: "예정", PAID: "지급완료", CANCELED: "취소" } as const;
const currency = (value: number) => `${roundWon(value).toLocaleString("ko-KR")}원`;

function Metric({ label, value, unit = "원", emphasized = false }: { label: string; value: number; unit?: "원" | "건"; emphasized?: boolean }) {
  return <Card className={emphasized ? "border-primary/40 bg-primary/5" : ""}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{roundWon(value).toLocaleString("ko-KR")}{unit}</p></CardContent></Card>;
}

function toSettlementCost(cost: CourseCost): SettlementCost {
  return {
    id: cost.id, name: cost.name,
    burden: cost.burdenType === "INSTRUCTOR" ? "instructor" : cost.burdenType === "SHARED" ? "shared" : "company",
    manager: cost.managerName, amount: cost.grossAmount, occurredOn: cost.paidDate, note: cost.note,
    evidenceRequired: cost.evidenceRequired, evidenceType: "기타", evidenceNeedsReview: cost.evidenceNeedsReview,
    attachments: cost.attachments.map((file) => ({ id: file.id, name: file.originalName, type: file.mimeType, size: file.size, url: file.url })),
    companyShareAmount: cost.companyShareAmount, instructorShareAmount: cost.instructorShareAmount,
  };
}

export function SettlementStatement({ instructor, monthlyAnalyses, courseId, courseName, courseCosts, appliedCourseCosts, costsAreSnapshot, draft: savedDraft, onChange, onSave, onConfirm, onReopen, busy }: {
  instructor: AggregatedInstructorSettlement; monthlyAnalyses: MonthlyAnalysis[]; courseId: string; courseName: string;
  courseCosts: CourseCost[]; appliedCourseCosts: CourseCost[]; costsAreSnapshot: boolean; draft?: SettlementStatementDraft;
  onChange: (draft: SettlementStatementDraft) => void; onSave: (draft: SettlementStatementDraft) => Promise<SettlementStatementDraft>;
  onConfirm: (draft: SettlementStatementDraft) => Promise<SettlementStatementDraft>; onReopen: () => Promise<void>; busy: boolean;
}) {
  const draft = savedDraft ?? createSettlementStatementDraft(courseName);
  const confirmed = Boolean(draft.confirmedAt);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const settlementCosts = useMemo(() => appliedCourseCosts.map(toSettlementCost), [appliedCourseCosts]);
  const calculation = useMemo(() => calculateCostSettlement({ totalSales: instructor.totalSales, pgFee: instructor.pgFee, novaFee: instructor.systemNovaFee, costs: settlementCosts, instructorRatioPercent: draft.instructorRatioPercent }), [draft.instructorRatioPercent, instructor.pgFee, instructor.systemNovaFee, instructor.totalSales, settlementCosts]);
  const transactionMetrics = useMemo(() => {
    const payers = new Set<string>(); let paymentCount = 0, refundCount = 0, paymentAmount = 0, refundAmount = 0;
    for (const month of monthlyAnalyses) { const source = month.detailsByInstructor[instructor.instructor]; if (!source) continue;
      for (const row of source.toss) { if (row.buyer) payers.add(`name:${row.buyer}`); paymentCount += 1; if (row.amount < 0 || row.status.includes("취소")) refundCount += 1; if (row.amount >= 0) paymentAmount += row.amount; else refundAmount += row.amount; }
      for (const row of source.cash) { const payer = row.email || row.phone || row.buyer; if (payer) payers.add(`cash:${payer}`); paymentCount += 1; paymentAmount += row.paymentAmount; refundAmount += row.cancellationAmount; if (row.cancellationAmount !== 0) refundCount += 1; }
    } return { payerCount: payers.size, paymentCount, refundCount, paymentAmount, refundAmount };
  }, [instructor.instructor, monthlyAnalyses]);
  const missingEvidence = appliedCourseCosts.filter((cost) => cost.evidenceRequired && cost.attachments.length === 0);
  const patchDraft = (patch: Partial<SettlementStatementDraft>) => onChange({ ...draft, ...patch });
  async function run(action: () => Promise<SettlementStatementDraft>, success: string) { setError(""); setNotice(""); try { onChange(await action()); setNotice(success); } catch (caught) { setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다."); } }
  function downloadDraft() { const payload = { kind: "bizup-course-settlement", version: 2, savedAt: new Date().toISOString(), issuer: ISSUER, instructor, draft, costs: appliedCourseCosts, ledgerCosts: courseCosts, calculation }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${instructor.instructor}_정산정보.json`; anchor.click(); URL.revokeObjectURL(url); }
  function printStatement() {
    if (!draft.lectureName.trim() || !draft.coursePeriod.trim() || !draft.settlementPeriod.trim() || !draft.manager.trim()) { setError("PDF 출력 전에 강의명, 강의기간, 정산기간, 담당자를 모두 입력해 주세요."); return; }
    const rows = appliedCourseCosts.map((cost) => `<tr><td>${escapePrintHtml(cost.name)}</td><td>${burdenLabel[cost.burdenType]}</td><td>${escapePrintHtml(cost.managerName)}</td><td class="number">${currency(cost.grossAmount)}</td><td>${escapePrintHtml(cost.paidDate)}</td><td>${cost.evidenceNeedsReview ? "확인필요" : cost.attachments.length ? "등록완료" : cost.evidenceRequired ? "미등록" : "증빙 불필요"}</td><td>${escapePrintHtml(cost.note)}</td></tr>`).join("") || '<tr><td colspan="7">정산기간에 포함된 지급완료 비용이 없습니다.</td></tr>';
    const flow = [["전체 매출",calculation.totalSales],["PG 수수료",-calculation.pgFee],["노바 수수료",-calculation.novaFee],["정산대상 매출",calculation.settlementTargetRevenue],["공동 부담 비용",-calculation.costs.shared],["분배 기준액",calculation.distributionBase],[`강사 기본분 (${calculation.instructorRatioPercent}%)`,calculation.instructorBase],["강사 부담 비용",-calculation.costs.instructor],["공동비용 강사 부담분",-calculation.costs.sharedInstructor],["강사 공급가액",calculation.instructorSupply],["VAT 10%",calculation.vat],["최종 강사 지급액",calculation.instructorFinal],[`회사 기본분 (${calculation.companyRatioPercent}%)`,calculation.companyBase],["회사 부담 비용",-calculation.costs.company],["공동비용 회사 부담분",-calculation.costs.sharedCompany],["회사 지급분",calculation.companyFinal]].map(([label,value]) => `<tr><th>${label}</th><td class="number">${currency(Number(value))}</td></tr>`).join("");
    printHtmlDocument(`${draft.lectureName.replace(/[\\/:*?"<>|]/gu,"_")}_최종_정산서`, `<h1>${escapePrintHtml(draft.lectureName)} 최종 정산서</h1><p class="meta">발행처 ${ISSUER} · 발행일 ${escapePrintHtml(draft.issueDate)} · 상태 ${draft.status}</p><p>강사 ${escapePrintHtml(instructor.instructor)} · 강의기간 ${escapePrintHtml(draft.coursePeriod)} · 정산기간 ${escapePrintHtml(draft.settlementPeriod)} · 담당자 ${escapePrintHtml(draft.manager)}</p><h2>매출</h2><table><tbody><tr><th>결제자 수</th><td>${transactionMetrics.payerCount}건</td><th>결제 건수</th><td>${transactionMetrics.paymentCount}건</td><th>환불 건수</th><td>${transactionMetrics.refundCount}건</td></tr></tbody></table><h2>비용 상세</h2><table><thead><tr><th>비용명</th><th>부담</th><th>담당자</th><th>금액</th><th>지급일</th><th>증빙</th><th>비고</th></tr></thead><tbody>${rows}</tbody></table><h2>최종 정산 계산</h2><table><tbody>${flow}</tbody></table>`);
  }
  return <div className="space-y-5">
    {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}{notice ? <Alert><CheckCircle2/><AlertTitle>처리 완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{instructor.instructor} 최종 정산서</CardTitle><CardDescription>비용 탭에 저장된 지급완료 비용을 자동 반영합니다.</CardDescription></div><div className="flex flex-wrap gap-2"><Badge variant={confirmed ? "default" : "outline"}>{draft.status}</Badge>{costsAreSnapshot ? <Badge variant="secondary">확정 스냅샷</Badge> : null}{!confirmed ? <Button variant="outline" onClick={() => void run(() => onSave(draft), "정산 정보를 저장했습니다.")} disabled={busy}>{busy?<Loader2 className="animate-spin"/>:<Save/>}정산 정보 저장</Button> : null}<Button variant="outline" onClick={downloadDraft}><Download/>JSON 저장</Button><Button onClick={printStatement}><Printer/>정산서 인쇄/PDF</Button></div></div></CardHeader><CardContent className="grid gap-x-4 gap-y-5 md:grid-cols-3">{[["강의명","lectureName"],["강의기간","coursePeriod"],["정산기간","settlementPeriod"],["담당자","manager"]].map(([label,key])=><div className="space-y-2" key={key}><Label>{label} *</Label><Input disabled={confirmed} value={String(draft[key as keyof SettlementStatementDraft])} onChange={(event)=>patchDraft({[key]:event.target.value})}/></div>)}<div className="space-y-2"><Label>발행일</Label><Input disabled={confirmed} type="date" value={draft.issueDate} onChange={(event)=>patchDraft({issueDate:event.target.value})}/></div><div className="space-y-2"><Label>강사 배분율 (%)</Label><Input disabled={confirmed} type="number" min="0" max="100" step="0.1" value={draft.instructorRatioPercent} onChange={(event)=>patchDraft({instructorRatioPercent:Number(event.target.value)})}/></div></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-3"><Metric label="결제자 수" value={transactionMetrics.payerCount} unit="건"/><Metric label="결제 건수" value={transactionMetrics.paymentCount} unit="건"/><Metric label="환불 건수" value={transactionMetrics.refundCount} unit="건"/></div><div className="grid gap-4 md:grid-cols-3"><Metric label="총 결제액" value={transactionMetrics.paymentAmount}/><Metric label="총 환불액" value={transactionMetrics.refundAmount}/><Metric label="전체 매출" value={calculation.totalSales} emphasized/></div><div className="grid gap-4 md:grid-cols-4"><Metric label="PG 수수료" value={calculation.pgFee}/><Metric label="노바 수수료" value={calculation.novaFee}/><Metric label="총 수수료" value={calculation.totalFee}/><Metric label="정산대상 매출" value={calculation.settlementTargetRevenue} emphasized/></div>
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>비용</CardTitle><CardDescription>비용 탭에 저장된 전체 내역입니다. 지급완료 상태의 비용이 최종 계산에 반영됩니다.</CardDescription></div><Button asChild variant="outline"><Link href={`/services/course-operations/${courseId}?tab=costs`}>비용 관리로 이동</Link></Button></div></CardHeader><CardContent className="space-y-5">{(["COMPANY","SHARED","INSTRUCTOR"] as const).map((burden)=><section key={burden}><div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{burdenLabel[burden]}</h3><Badge variant="secondary">합계 {currency(courseCosts.filter((cost)=>cost.burdenType===burden).reduce((sum,cost)=>sum+cost.grossAmount,0))}</Badge></div><div className="space-y-2">{courseCosts.filter((cost)=>cost.burdenType===burden).map((cost)=><div key={cost.id} className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]"><strong>{cost.name}</strong><span>{cost.managerName}</span><Badge variant={cost.status === "PAID" ? "default" : "outline"}>{costStatusLabel[cost.status]}</Badge><span>{cost.paidDate || "-"}</span><span className="text-right tabular-nums">{currency(cost.grossAmount)}</span></div>)}{!courseCosts.some((cost)=>cost.burdenType===burden)?<p className="rounded-lg border border-dashed py-5 text-center text-sm text-muted-foreground">저장된 비용이 없습니다.</p>:null}</div></section>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>최종 정산 계산</CardTitle><CardDescription>공동비용은 비용 탭에 저장된 회사·강사 부담 비율로 차감합니다.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-4"><Metric label="정산대상 매출" value={calculation.settlementTargetRevenue}/><Metric label="공동 부담 비용" value={calculation.costs.shared}/><Metric label="분배 기준액" value={calculation.distributionBase}/><Metric label="강사 기본분" value={calculation.instructorBase}/><Metric label="강사 부담 비용" value={calculation.costs.instructor}/><Metric label="공동비용 강사 부담분" value={calculation.costs.sharedInstructor}/><Metric label="강사 공급가액" value={calculation.instructorSupply}/><Metric label="VAT 10%" value={calculation.vat}/><Metric label="최종 강사 지급액" value={calculation.instructorFinal} emphasized/><Metric label="회사 기본분" value={calculation.companyBase}/><Metric label="회사 부담 비용" value={calculation.costs.company}/><Metric label="공동비용 회사 부담분" value={calculation.costs.sharedCompany}/><Metric label="회사 지급분" value={calculation.companyFinal} emphasized/></div>{missingEvidence.length?<Alert variant="destructive"><AlertTriangle/><AlertTitle>필수 증빙 미등록 {missingEvidence.length}건</AlertTitle><AlertDescription>{missingEvidence.map((cost)=>cost.name).join(", ")}</AlertDescription></Alert>:null}{!confirmed?<div><Label>예외 확정 사유</Label><Textarea placeholder="필수 증빙 없이 확정해야 하는 사유를 기록하세요." value={draft.exceptionReason} onChange={(event)=>patchDraft({exceptionReason:event.target.value})}/></div>:draft.exceptionReason?<Alert><AlertTitle>예외 확정 사유</AlertTitle><AlertDescription>{draft.exceptionReason}</AlertDescription></Alert>:null}<div className="flex justify-end">{confirmed?<Button variant="outline" disabled={busy} onClick={()=>void onReopen()}>{busy?<Loader2 className="animate-spin"/>:null}정산 확정 취소</Button>:<Button disabled={busy} onClick={()=>void run(()=>onConfirm(draft),"정산을 확정했습니다.")}>{busy?<Loader2 className="animate-spin"/>:<CheckCircle2/>}정산 확정</Button>}</div></CardContent></Card>
  </div>;
}
