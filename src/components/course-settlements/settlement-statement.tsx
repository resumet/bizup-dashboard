"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FilePlus2, Paperclip, Plus, Printer, Trash2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateCostSettlement,
  createDefaultSettlementCosts,
  parseAmount,
  roundWon,
  type AggregatedInstructorSettlement,
  type CostBurden,
  type MonthlyAnalysis,
  type SettlementCost,
} from "@/lib/course-settlements/engine";
import { escapePrintHtml, printHtmlDocument } from "@/lib/course-settlements/print";

const ISSUER = "주식회사 비즈업클래스";
const EVIDENCE_TYPES = ["세금계산서", "종이영수증", "카드영수증", "계좌이체 내역", "계약서", "기타"] as const;
const BURDEN_LABELS: Record<CostBurden, string> = { company: "회사 부담", instructor: "강사 부담", shared: "공동 부담" };
const ALLOWED_EVIDENCE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export type SettlementStatementDraft = {
  issueDate: string;
  lectureName: string;
  coursePeriod: string;
  settlementPeriod: string;
  manager: string;
  status: "작성중" | "검토대기" | "정산확정";
  instructorRatioPercent: number;
  costs: SettlementCost[];
  exceptionReason: string;
  confirmedAt: string;
};

export function createSettlementStatementDraft(courseName: string): SettlementStatementDraft {
  return {
    issueDate: new Date().toLocaleDateString("sv-SE"), lectureName: courseName,
    coursePeriod: "", settlementPeriod: "", manager: "", status: "작성중",
    instructorRatioPercent: 50, costs: createDefaultSettlementCosts(), exceptionReason: "", confirmedAt: "",
  };
}

function currency(value: number) {
  return `${roundWon(value).toLocaleString("ko-KR")}원`;
}

function evidenceStatus(cost: SettlementCost) {
  if (!cost.evidenceRequired) return "증빙 불필요";
  if (!cost.attachments.length) return "미등록";
  return cost.evidenceNeedsReview ? "확인필요" : "등록완료";
}

function Metric({ label, value, unit = "원", emphasized }: { label: string; value: number; unit?: "원" | "건"; emphasized?: boolean }) {
  const formatted = unit === "건" ? `${roundWon(value).toLocaleString("ko-KR")}건` : currency(value);
  return <Card className={emphasized ? "border-primary/40 bg-primary/5" : ""}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatted}</p></CardContent></Card>;
}

export function SettlementStatement({
  instructor, monthlyAnalyses, courseName, draft: savedDraft, onChange,
}: {
  instructor: AggregatedInstructorSettlement;
  monthlyAnalyses: MonthlyAnalysis[];
  courseName: string;
  draft?: SettlementStatementDraft;
  onChange: (draft: SettlementStatementDraft) => void;
}) {
  const draft = savedDraft ?? createSettlementStatementDraft(courseName);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const calculation = useMemo(() => calculateCostSettlement({
    totalSales: instructor.totalSales,
    pgFee: instructor.pgFee,
    novaFee: instructor.systemNovaFee,
    costs: draft.costs,
    instructorRatioPercent: draft.instructorRatioPercent,
  }), [draft.costs, draft.instructorRatioPercent, instructor.pgFee, instructor.systemNovaFee, instructor.totalSales]);

  const transactionMetrics = useMemo(() => {
    const details = monthlyAnalyses.flatMap((month) => {
      const source = month.detailsByInstructor[instructor.instructor];
      return source ? [source] : [];
    });
    const payers = new Set<string>();
    let paymentCount = 0;
    let refundCount = 0;
    let paymentAmount = 0;
    let refundAmount = 0;
    for (const source of details) {
      for (const row of source.toss) {
        if (row.buyer) payers.add(`name:${row.buyer}`);
        paymentCount += 1;
        if (row.amount < 0 || row.status.includes("취소")) refundCount += 1;
        if (row.amount >= 0) paymentAmount += row.amount;
        else refundAmount += row.amount;
      }
      for (const row of source.cash) {
        const payer = row.email || row.phone || row.buyer;
        if (payer) payers.add(`cash:${payer}`);
        paymentCount += 1;
        paymentAmount += row.paymentAmount;
        refundAmount += row.cancellationAmount;
        if (row.cancellationAmount !== 0) refundCount += 1;
      }
    }
    return { payerCount: payers.size, paymentCount, refundCount, paymentAmount, refundAmount };
  }, [instructor.instructor, monthlyAnalyses]);

  const missingEvidence = draft.costs.filter((cost) => cost.evidenceRequired && !cost.attachments.length);

  function patchDraft(patch: Partial<SettlementStatementDraft>) {
    onChange({ ...draft, ...patch, status: draft.status === "정산확정" ? "작성중" : (patch.status ?? draft.status) });
  }

  function patchCost(costId: string, patch: Partial<SettlementCost>) {
    patchDraft({ costs: draft.costs.map((cost) => cost.id === costId ? { ...cost, ...patch } : cost) });
  }

  function addCost(burden: CostBurden) {
    patchDraft({ costs: [...draft.costs, {
      id: crypto.randomUUID(), name: "", burden, manager: "", amount: 0, occurredOn: "", note: "",
      evidenceRequired: false, evidenceType: "세금계산서", evidenceNeedsReview: false, attachments: [],
    }] });
  }

  function addAttachments(cost: SettlementCost, files: FileList | null) {
    if (!files) return;
    setError("");
    const accepted = Array.from(files).filter((file) => {
      if (ALLOWED_EVIDENCE_TYPES.has(file.type)) return true;
      setError(`${file.name}: PDF/JPG/JPEG/PNG 증빙만 첨부할 수 있습니다.`);
      return false;
    }).map((file) => ({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, file }));
    if (accepted.length) patchCost(cost.id, { attachments: [...cost.attachments, ...accepted] });
  }

  function confirmSettlement() {
    setError(""); setNotice("");
    if (missingEvidence.length && !draft.exceptionReason.trim()) {
      setError(`필수 증빙이 없는 비용이 ${missingEvidence.length}개입니다. 증빙을 등록하거나 예외 확정 사유를 입력해 주세요.`);
      return;
    }
    onChange({ ...draft, status: "정산확정", confirmedAt: new Date().toISOString() });
    setNotice(missingEvidence.length ? "예외 사유를 기록하고 정산을 확정했습니다." : "필수 증빙을 확인하고 정산을 확정했습니다.");
  }

  function downloadDraft() {
    const serializable = { ...draft, costs: draft.costs.map((cost) => ({ ...cost, attachments: cost.attachments.map((attachment) => ({ id: attachment.id, name: attachment.name, type: attachment.type, size: attachment.size })) })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: "bizup-course-settlement", version: 1, savedAt: new Date().toISOString(), issuer: ISSUER, instructor, draft: serializable, calculation }, null, 2)], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${instructor.instructor}_정산정보.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  function printStatement() {
    setError("");
    if (!draft.lectureName.trim() || !draft.coursePeriod.trim() || !draft.settlementPeriod.trim() || !draft.manager.trim()) {
      setError("PDF 출력 전에 강의명, 강의기간, 정산기간, 담당자를 모두 입력해 주세요.");
      return;
    }
    const costRows = draft.costs.map((cost) => `<tr><td>${escapePrintHtml(cost.name)}</td><td>${BURDEN_LABELS[cost.burden]}</td><td>${escapePrintHtml(cost.manager)}</td><td class="number">${currency(cost.amount)}</td><td>${escapePrintHtml(cost.occurredOn)}</td><td>${escapePrintHtml(evidenceStatus(cost))}${cost.attachments.length ? `<br>${cost.attachments.map((item) => escapePrintHtml(item.name)).join("<br>")}` : ""}</td><td>${escapePrintHtml(cost.note)}</td></tr>`).join("");
    const flowRows = [
      ["전체 매출", calculation.totalSales], ["PG 수수료", -calculation.pgFee], ["노바 수수료", -calculation.novaFee],
      ["정산대상 매출", calculation.settlementTargetRevenue], ["공동 부담 비용", -calculation.costs.shared], ["분배 기준액", calculation.distributionBase],
      [`강사 기본분 (${calculation.instructorRatioPercent}%)`, calculation.instructorBase], ["강사 부담 비용", -calculation.costs.instructor],
      ["강사 공급가액", calculation.instructorSupply], ["VAT 10%", calculation.vat], ["최종 강사 지급액", calculation.instructorFinal],
      [`회사 기본분 (${calculation.companyRatioPercent}%)`, calculation.companyBase], ["회사 부담 비용", -calculation.costs.company], ["회사 지급분", calculation.companyFinal],
    ].map(([label, value]) => `<tr${label === "최종 강사 지급액" || label === "회사 지급분" ? " class=\"total\"" : ""}><th>${label}</th><td class="number">${currency(Number(value))}</td></tr>`).join("");
    const safeLecture = draft.lectureName.replace(/[\\/:*?"<>|]/gu, "_");
    printHtmlDocument(`${safeLecture}_최종_정산서`, `<h1>${escapePrintHtml(draft.lectureName)} 최종 정산서</h1><p class="meta">발행자 ${ISSUER} · 발행일 ${escapePrintHtml(draft.issueDate)} · 상태 ${draft.status}</p><div class="grid"><div class="card"><div class="label">강사명</div><div class="value">${escapePrintHtml(instructor.instructor)}</div></div><div class="card"><div class="label">강의기간</div><div class="value">${escapePrintHtml(draft.coursePeriod)}</div></div><div class="card"><div class="label">정산기간</div><div class="value">${escapePrintHtml(draft.settlementPeriod)}</div></div><div class="card"><div class="label">담당자</div><div class="value">${escapePrintHtml(draft.manager)}</div></div><div class="card"><div class="label">결제자/결제/환불</div><div class="value">${transactionMetrics.payerCount}명 / ${transactionMetrics.paymentCount}건 / ${transactionMetrics.refundCount}건</div></div><div class="card"><div class="label">정산 비율</div><div class="value">강사 ${calculation.instructorRatioPercent}% · 회사 ${calculation.companyRatioPercent}%</div></div></div><h2>매출·수수료</h2><table><tbody><tr><th>총 결제액</th><td class="number">${currency(transactionMetrics.paymentAmount)}</td><th>총 환불액</th><td class="number">${currency(transactionMetrics.refundAmount)}</td><th>전체 매출</th><td class="number">${currency(calculation.totalSales)}</td></tr><tr><th>PG 수수료</th><td class="number">${currency(calculation.pgFee)}</td><th>노바 수수료</th><td class="number">${currency(calculation.novaFee)}</td><th>정산대상 매출</th><td class="number">${currency(calculation.settlementTargetRevenue)}</td></tr></tbody></table><h2>비용 상세</h2><table><thead><tr><th>비용명</th><th>부담</th><th>담당자</th><th>금액</th><th>발생일</th><th>증빙</th><th>비고</th></tr></thead><tbody>${costRows}</tbody></table><h2>최종 정산 계산</h2><table><tbody>${flowRows}</tbody></table>${missingEvidence.length ? `<p class="warning">미등록 필수 증빙: ${missingEvidence.map((cost) => escapePrintHtml(cost.name)).join(", ")}${draft.exceptionReason ? ` · 예외 사유: ${escapePrintHtml(draft.exceptionReason)}` : ""}</p>` : ""}`);
  }

  return <div className="space-y-5">
    {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {notice ? <Alert><CheckCircle2/><AlertTitle>처리 완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{instructor.instructor} 최종 정산서</CardTitle><CardDescription>회사·강사·공동 부담 비용과 증빙을 반영합니다.</CardDescription></div><div className="flex gap-2"><Badge variant={draft.status === "정산확정" ? "default" : "outline"}>{draft.status}</Badge><Button variant="outline" onClick={downloadDraft}><Download/>JSON 저장</Button><Button onClick={printStatement}><Printer/>정산서 인쇄/PDF</Button></div></div></CardHeader><CardContent className="grid gap-x-4 gap-y-5 md:grid-cols-3"><div className="space-y-2"><Label>강의명 *</Label><Input value={draft.lectureName} onChange={(event) => patchDraft({ lectureName: event.target.value })}/></div><div className="space-y-2"><Label>강의기간 *</Label><Input placeholder="2026-06-01 ~ 2026-07-31" value={draft.coursePeriod} onChange={(event) => patchDraft({ coursePeriod: event.target.value })}/></div><div className="space-y-2"><Label>정산기간 *</Label><Input placeholder="2026년 6월 ~ 7월" value={draft.settlementPeriod} onChange={(event) => patchDraft({ settlementPeriod: event.target.value })}/></div><div className="space-y-2"><Label>담당자 *</Label><Input value={draft.manager} onChange={(event) => patchDraft({ manager: event.target.value })}/></div><div className="space-y-2"><Label>발행일</Label><Input type="date" value={draft.issueDate} onChange={(event) => patchDraft({ issueDate: event.target.value })}/></div><div className="space-y-2"><Label>강사 배분율 (%)</Label><Input type="number" min="0" max="100" step="0.1" value={draft.instructorRatioPercent} onChange={(event) => patchDraft({ instructorRatioPercent: Number(event.target.value) })}/><p className="text-xs text-muted-foreground">회사 {calculation.companyRatioPercent}% · 공동비용 차감 후 적용</p></div></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-3"><Metric label="결제자 건수" value={transactionMetrics.payerCount} unit="건"/><Metric label="결제건수" value={transactionMetrics.paymentCount} unit="건"/><Metric label="환불건수" value={transactionMetrics.refundCount} unit="건"/></div>
    <div className="grid gap-4 md:grid-cols-3"><Metric label="총 결제액" value={transactionMetrics.paymentAmount}/><Metric label="총 환불액" value={transactionMetrics.refundAmount}/><Metric label="전체 매출" value={calculation.totalSales} emphasized/></div>
    <div className="grid gap-4 md:grid-cols-4"><Metric label="PG 수수료" value={calculation.pgFee}/><Metric label="노바 수수료" value={calculation.novaFee}/><Metric label="총 수수료" value={calculation.totalFee}/><Metric label="정산대상 매출" value={calculation.settlementTargetRevenue} emphasized/></div>
    <Card><CardHeader><CardTitle>비용 관리</CardTitle><CardDescription>광고 운영·대행비는 회사 부담, 실제 광고 매체비는 공동 부담이 기본입니다. 비용은 추가한 카드의 부담 주체로 자동 분류됩니다.</CardDescription></CardHeader><CardContent className="space-y-6">{(["company", "shared", "instructor"] as const).map((burden) => { const items = draft.costs.filter((cost) => cost.burden === burden); return <section key={burden}><div className="mb-2 flex items-center justify-between gap-2"><h3 className="font-semibold">{BURDEN_LABELS[burden]}</h3><div className="flex items-center gap-2"><Badge variant="secondary">합계 {currency(calculation.costs[burden])}</Badge><Button size="sm" variant="outline" onClick={() => addCost(burden)}><Plus/>비용 추가</Button></div></div><div className="space-y-3">{items.map((cost) => <div key={cost.id} className="rounded-lg border p-3"><div className="grid gap-2 md:grid-cols-[1.5fr_1fr_150px_150px_auto]"><Input aria-label="비용명" placeholder="비용명" value={cost.name} onChange={(event) => patchCost(cost.id, { name: event.target.value })}/><Input aria-label="담당자" placeholder="담당자" value={cost.manager} onChange={(event) => patchCost(cost.id, { manager: event.target.value })}/><Input aria-label="금액" placeholder="금액" inputMode="numeric" value={cost.amount ? roundWon(cost.amount).toLocaleString("ko-KR") : ""} onChange={(event) => patchCost(cost.id, { amount: roundWon(parseAmount(event.target.value)) })}/><Input aria-label="발생일" type="date" value={cost.occurredOn} onChange={(event) => patchCost(cost.id, { occurredOn: event.target.value })}/><Button size="icon" variant="ghost" aria-label={`${cost.name || "비용"} 삭제`} onClick={() => patchDraft({ costs: draft.costs.filter((item) => item.id !== cost.id) })}><Trash2 className="text-destructive"/></Button></div><div className="mt-2 grid gap-2 md:grid-cols-[1fr_180px_160px_1.5fr]"><div className="flex h-10 items-center gap-2 rounded-lg border px-3"><Checkbox id={`evidence-${cost.id}`} checked={cost.evidenceRequired} onCheckedChange={(checked) => patchCost(cost.id, { evidenceRequired: checked === true })}/><Label htmlFor={`evidence-${cost.id}`}>증빙 필요</Label></div><Select value={cost.evidenceType} onValueChange={(value: SettlementCost["evidenceType"]) => patchCost(cost.id, { evidenceType: value })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{EVIDENCE_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select><Label className="flex h-10 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm"><Paperclip className="mr-2 size-4"/>증빙 첨부<Input className="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => { addAttachments(cost, event.target.files); event.currentTarget.value = ""; }}/></Label><Input aria-label="비고" placeholder="비고" value={cost.note} onChange={(event) => patchCost(cost.id, { note: event.target.value })}/></div><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant={evidenceStatus(cost) === "미등록" || evidenceStatus(cost) === "확인필요" ? "destructive" : "outline"}>{evidenceStatus(cost)}</Badge>{cost.attachments.map((attachment) => <span key={attachment.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"><FilePlus2 className="size-3"/>{attachment.name}<button type="button" aria-label={`${attachment.name} 제거`} onClick={() => patchCost(cost.id, { attachments: cost.attachments.filter((item) => item.id !== attachment.id) })}>×</button></span>)}{cost.attachments.length ? <label className="ml-auto flex items-center gap-2 text-xs"><Checkbox checked={cost.evidenceNeedsReview} onCheckedChange={(checked) => patchCost(cost.id, { evidenceNeedsReview: checked === true })}/>확인필요 표시</label> : null}</div></div>)}</div></section>; })}</CardContent></Card>
    <Card><CardHeader><CardTitle>최종 정산 계산</CardTitle><CardDescription>정산대상 매출 → 공동비용 → 분배 → 개별 부담비용 순서입니다.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="grid gap-4 md:grid-cols-4"><Metric label="정산대상 매출" value={calculation.settlementTargetRevenue}/><Metric label="공동 부담 비용" value={calculation.costs.shared}/><Metric label="분배 기준액" value={calculation.distributionBase}/><Metric label="강사 기본분" value={calculation.instructorBase}/><Metric label="강사 부담 비용" value={calculation.costs.instructor}/><Metric label="강사 공급가액" value={calculation.instructorSupply}/><Metric label="VAT 10%" value={calculation.vat}/><Metric label="최종 강사 지급액" value={calculation.instructorFinal} emphasized/><Metric label="회사 기본분" value={calculation.companyBase}/><Metric label="회사 부담 비용" value={calculation.costs.company}/><Metric label="회사 지급분" value={calculation.companyFinal} emphasized/></div>{missingEvidence.length ? <Alert variant="destructive"><AlertTriangle/><AlertTitle>필수 증빙 미등록 {missingEvidence.length}개</AlertTitle><AlertDescription>{missingEvidence.map((cost) => cost.name || "이름 없는 비용").join(", ")}</AlertDescription></Alert> : null}<div><Label>예외 확정 사유</Label><Textarea placeholder="필수 증빙 없이 확정해야 할 때 사유를 기록하세요." value={draft.exceptionReason} onChange={(event) => patchDraft({ exceptionReason: event.target.value })}/></div><div className="flex justify-end"><Button onClick={confirmSettlement}><CheckCircle2/>정산 확정</Button></div></CardContent></Card>
  </div>;
}
