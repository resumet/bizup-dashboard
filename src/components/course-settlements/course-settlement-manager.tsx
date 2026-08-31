"use client";

import { useEffect, useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import { Calculator, CheckCircle2, FileSpreadsheet, Loader2, Printer, Trash2, XCircle } from "lucide-react";

import {
  SettlementStatement,
  type SettlementStatementDraft,
} from "@/components/course-settlements/settlement-statement";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SETTLEMENT_ENGINE_VERSION,
  analyzeWorkbooks,
  roundWon,
  type SettlementAnalysis,
  type WorkbookInput,
} from "@/lib/course-settlements/engine";
import { escapePrintHtml, printHtmlDocument } from "@/lib/course-settlements/print";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
type FileEntry = { id: string; file: File };
type PersistedWorkspace = {
  files: FileEntry[];
  analysis: SettlementAnalysis | null;
  statements?: Record<string, SettlementStatementDraft>;
};

const currency = (value: number | null | undefined) => value == null ? "-" : `${roundWon(value).toLocaleString("ko-KR")}원`;

function openWorkspaceDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("bizup-course-settlements", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspaces");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadWorkspace(key: string) {
  const db = await openWorkspaceDb();
  return new Promise<PersistedWorkspace | undefined>((resolve, reject) => {
    const request = db.transaction("workspaces", "readonly").objectStore("workspaces").get(key);
    request.onsuccess = () => resolve(request.result as PersistedWorkspace | undefined);
    request.onerror = () => reject(request.error);
  }).finally(() => db.close());
}

async function saveWorkspace(key: string, value: PersistedWorkspace) {
  const db = await openWorkspaceDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction("workspaces", "readwrite").objectStore("workspaces").put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

function detailTable(headers: string[], rows: Array<Array<string | number>>) {
  if (!rows.length) return "<p>내역 없음</p>";
  return `<table><thead><tr>${headers.map((header) => `<th>${escapePrintHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td class="${typeof cell === "number" ? "number" : ""}">${typeof cell === "number" ? currency(cell) : escapePrintHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function Metric({ label, value, emphasized }: { label: string; value: number; emphasized?: boolean }) {
  return <Card className={emphasized ? "border-primary/40 bg-primary/5" : ""}><CardHeader className="pb-3"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl">{currency(value)}</CardTitle></CardHeader></Card>;
}

export function CourseSettlementManager({ courseId, courseName, instructorName }: { courseId: string; courseName: string; instructorName: string }) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [analysis, setAnalysis] = useState<SettlementAnalysis | null>(null);
  const [statements, setStatements] = useState<Record<string, SettlementStatementDraft>>({});
  const [selectedInstructor, setSelectedInstructor] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void loadWorkspace(courseId).then((stored) => {
      if (!stored) return;
      setFiles(stored.files ?? []);
      setAnalysis(stored.analysis ?? null);
      setStatements(stored.statements ?? {});
    }).catch(() => setError("브라우저에 저장된 정산 작업을 불러오지 못했습니다.")).finally(() => setHydrated(true));
  }, [courseId]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void saveWorkspace(courseId, { files, analysis, statements }).catch(() => setError("정산 작업을 브라우저에 저장하지 못했습니다."));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [analysis, courseId, files, hydrated, statements]);

  const activeInstructor = analysis?.instructorResults.some((item) => item.instructor === selectedInstructor)
    ? selectedInstructor
    : (analysis?.instructorResults[0]?.instructor ?? "");
  const instructor = analysis?.instructorResults.find((item) => item.instructor === activeInstructor) ?? null;

  function addFiles(selected: FileList | null) {
    if (!selected) return;
    setError(""); setNotice("");
    const additions: FileEntry[] = [];
    for (const file of Array.from(selected)) {
      if (!file.name.toLowerCase().endsWith(".xlsx")) { setError(`${file.name}: .xlsx 파일만 추가할 수 있습니다.`); continue; }
      if (file.size > MAX_FILE_SIZE) { setError(`${file.name}: 파일 크기가 25 MiB를 초과합니다.`); continue; }
      const duplicate = [...files, ...additions].some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
      if (duplicate) { setError(`${file.name}: 이미 추가한 동일한 파일입니다.`); continue; }
      additions.push({ id: crypto.randomUUID(), file });
    }
    if (additions.length) {
      setFiles((current) => [...current, ...additions]);
      setAnalysis(null);
      setNotice(`${additions.length}개 파일을 추가했습니다. 다시 분석해 주세요.`);
    }
  }

  async function runAnalysis() {
    setBusy(true); setError(""); setNotice("");
    try {
      const workbooks: WorkbookInput[] = [];
      for (const [inputOrder, entry] of files.entries()) {
        const sheets = await readXlsxFile(entry.file) as unknown as WorkbookInput["sheets"];
        workbooks.push({ fileName: entry.file.name, fileSize: entry.file.size, lastModified: entry.file.lastModified, inputOrder, sheets });
      }
      const result = analyzeWorkbooks(workbooks);
      setAnalysis(result);
      setSelectedInstructor(result.instructorResults[0]?.instructor ?? "");
      setNotice(`${result.monthlyAnalyses.length}개월 · 강사 ${result.instructorResults.length}명의 정산 분석을 완료했습니다.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "엑셀을 분석하지 못했습니다."); }
    finally { setBusy(false); }
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((item) => item.id !== id));
    setAnalysis(null);
    setNotice("파일 구성이 바뀌어 기존 분석을 초기화했습니다. 다시 분석해 주세요.");
  }

  function printInstructorReport() {
    if (!instructor || !analysis) return;
    setError("");
    try {
      const summaryRows = instructor.monthlySettlements.map((month) => `<tr><td>${escapePrintHtml(month.periodLabel)}</td><td>${escapePrintHtml(month.fileName)}</td><td class="number">${currency(month.result.totalSales)}</td><td class="number">${currency(month.result.pgFee)}</td><td class="number">${currency(month.result.systemNovaFee)}</td><td class="number">${currency(month.result.additionalServiceFee)}</td><td class="number">${currency(month.result.finalSettlement)}</td></tr>`).join("");
      const details = analysis.monthlyAnalyses.map((month) => {
        const source = month.detailsByInstructor[instructor.instructor];
        if (!source) return "";
        return `<section><h2>${escapePrintHtml(month.periodLabel)} 원본 거래 내역</h2><h3>토스</h3>${detailTable(["일자", "구매자", "결제수단", "상태", "결제·취소액", "PG수수료"], source.toss.map((item) => [item.date, item.buyer, item.paymentMethod, item.status, item.amount, item.pgFee]))}<h3>무통장</h3>${detailTable(["일자", "구매자", "이메일", "전화번호", "결제액", "취소액"], source.cash.map((item) => [item.date, item.buyer, item.email, item.phone, item.paymentAmount, item.cancellationAmount]))}<h3>부가서비스</h3>${detailTable(["이용일", "서비스", "기타 비용", "총계", "비고"], source.service.map((item) => [item.date, item.serviceName, item.otherCost, item.total, item.note]))}</section>`;
      }).join("");
      const safeInstructor = instructor.instructor.replace(/[\\/:*?"<>|]/gu, "_");
      printHtmlDocument(`${safeInstructor}_정산표`, `<h1>${escapePrintHtml(instructor.instructor)} 정산표</h1><p class="meta">계산 엔진 ${SETTLEMENT_ENGINE_VERSION}</p><table><thead><tr><th>기간</th><th>원본</th><th>총매출</th><th>PG수수료</th><th>시스템노바</th><th>부가서비스</th><th>최종 정산금</th></tr></thead><tbody>${summaryRows}<tr class="total"><td colspan="2">누적</td><td class="number">${currency(instructor.totalSales)}</td><td class="number">${currency(instructor.pgFee)}</td><td class="number">${currency(instructor.systemNovaFee)}</td><td class="number">${currency(instructor.additionalServiceFee)}</td><td class="number">${currency(instructor.finalSettlement)}</td></tr></tbody></table>${details}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "정산표 인쇄 창을 열지 못했습니다."); }
  }

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-3 flex flex-wrap gap-2"><Badge>엔진 {SETTLEMENT_ENGINE_VERSION}</Badge>{analysis ? <Badge variant={analysis.allMatched ? "default" : "destructive"}>요약 {analysis.matchedCount}/{analysis.comparisonCount} 일치</Badge> : <Badge variant="outline">미분석</Badge>}</div><h1 className="text-3xl font-semibold">{courseName} 강의별 정산</h1><p className="mt-2 text-muted-foreground">{instructorName} · 월별 비즈업 엑셀을 원본 계산식 그대로 분석합니다.</p></div><div className="flex gap-2"><Label htmlFor="settlement-files" className="inline-flex h-10 cursor-pointer items-center rounded-md border bg-background px-4 text-sm font-medium"><FileSpreadsheet className="mr-2 size-4"/>월별 엑셀 추가</Label><Input id="settlement-files" type="file" accept=".xlsx" multiple className="sr-only" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }}/><Button onClick={runAnalysis} disabled={busy || !files.length}>{busy ? <Loader2 className="animate-spin"/> : <Calculator/>}분석하기</Button></div></div>
    {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {notice ? <Alert><AlertTitle>처리 완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle>월별 원본 파일</CardTitle><CardDescription>.xlsx만 가능 · 파일당 최대 25 MiB · 추가/삭제 시 재분석 필요 · 브라우저에 자동 저장</CardDescription></CardHeader><CardContent className="space-y-2">{files.length ? files.map((entry, index) => <div key={entry.id} className="flex items-center justify-between rounded-lg border p-3"><div><b>{index + 1}. {entry.file.name}</b><p className="text-sm text-muted-foreground">{(entry.file.size / 1024 / 1024).toFixed(2)} MiB</p></div><Button size="icon" variant="ghost" aria-label={`${entry.file.name} 삭제`} onClick={() => removeFile(entry.id)}><Trash2 className="text-destructive"/></Button></div>) : <p className="py-6 text-center text-muted-foreground">월별 비즈업클래스 엑셀을 추가해 주세요.</p>}</CardContent></Card>
    {analysis ? <Tabs defaultValue="overview"><TabsList className="h-auto flex-wrap"><TabsTrigger value="overview">전체·월별 검증</TabsTrigger><TabsTrigger value="instructors">강사별 누적</TabsTrigger><TabsTrigger value="statement">최종 정산서</TabsTrigger></TabsList>
      <TabsContent value="overview" className="space-y-5"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric label="전체 총매출" value={analysis.totals.totalSales}/><Metric label="PG 수수료" value={analysis.totals.pgFee}/><Metric label="시스템노바 수수료" value={analysis.totals.systemNovaFee}/><Metric label="전체 최종 정산 재원" value={analysis.totals.finalSettlement} emphasized/></div>{analysis.monthlyAnalyses.map((month) => <Card key={`${month.inputOrder}-${month.fileName}`}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><div><CardTitle>{month.periodLabel}</CardTitle><CardDescription>{month.fileName} · 강사 {month.instructorResults.length}명 · 무통장 시트 {month.hasCashSheet ? "있음" : "없음"}</CardDescription></div><Badge variant={month.allMatched ? "default" : "destructive"}>{month.allMatched ? <CheckCircle2/> : <XCircle/>}{month.comparisons.filter((item) => item.matches).length}/8 일치</Badge></div></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>요약 항목</TableHead><TableHead className="text-right">계산값</TableHead><TableHead className="text-right">요약값</TableHead><TableHead className="text-right">차액</TableHead></TableRow></TableHeader><TableBody>{month.comparisons.map((item) => <TableRow key={item.key}><TableCell className="font-medium">{item.label}</TableCell><TableCell className="text-right">{currency(item.calculatedValue)}</TableCell><TableCell className="text-right">{currency(item.summaryValue)}</TableCell><TableCell className={`text-right ${item.matches ? "text-emerald-700" : "text-destructive"}`}>{currency(item.difference)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>)}</TabsContent>
      <TabsContent value="instructors" className="space-y-4"><div className="flex flex-wrap gap-2">{analysis.instructorResults.map((item) => <Button key={item.instructor} variant={activeInstructor === item.instructor ? "default" : "outline"} onClick={() => setSelectedInstructor(item.instructor)}>{item.instructor}</Button>)}</div>{instructor ? <Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>{instructor.instructor}</CardTitle><CardDescription>전체 기간 누적 결과</CardDescription></div><Button variant="outline" onClick={printInstructorReport}><Printer/>정산표 인쇄/PDF</Button></div></CardHeader><CardContent><div className="mb-5 grid gap-3 md:grid-cols-3"><Metric label="누적 총매출" value={instructor.totalSales}/><Metric label="누적 시스템노바" value={instructor.systemNovaFee}/><Metric label="누적 최종 정산금" value={instructor.finalSettlement} emphasized/></div><Table><TableHeader><TableRow><TableHead>기간</TableHead><TableHead className="text-right">토스매출</TableHead><TableHead className="text-right">현금매출</TableHead><TableHead className="text-right">PG수수료</TableHead><TableHead className="text-right">부가서비스</TableHead><TableHead className="text-right">최종 정산금</TableHead></TableRow></TableHeader><TableBody>{instructor.monthlySettlements.map((month) => <TableRow key={month.fileName}><TableCell>{month.periodLabel}</TableCell><TableCell className="text-right">{currency(month.result.tossSales)}</TableCell><TableCell className="text-right">{currency(month.result.cashSales)}</TableCell><TableCell className="text-right">{currency(month.result.pgFee)}</TableCell><TableCell className="text-right">{currency(month.result.additionalServiceFee)}</TableCell><TableCell className="text-right font-medium">{currency(month.result.finalSettlement)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card> : null}</TabsContent>
      <TabsContent value="statement">{instructor ? <SettlementStatement instructor={instructor} monthlyAnalyses={analysis.monthlyAnalyses} courseName={courseName} draft={statements[instructor.instructor]} onChange={(draft) => setStatements((current) => ({ ...current, [instructor.instructor]: draft }))}/> : null}</TabsContent>
    </Tabs> : null}
  </div>;
}
