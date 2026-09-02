"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Printer,
  ReceiptText,
  Trash2,
  XCircle,
} from "lucide-react";

import { SettlementStatement } from "@/components/course-settlements/settlement-statement";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SETTLEMENT_ENGINE_VERSION,
  normalizeName,
  roundWon,
  type AggregatedInstructorSettlement,
  type SettlementAnalysis,
} from "@/lib/course-settlements/engine";
import { escapePrintHtml, printHtmlDocument } from "@/lib/course-settlements/print";
import {
  sanitizeSettlementStatementDraft,
  type SettlementStatementDraft,
} from "@/lib/course-settlements/statement";

type SettlementUpload = {
  id: string;
  fileName: string;
  periodLabel: string;
  createdAt: string;
  downloadUrl: string | null;
};

type SettlementAttachment = {
  id: string;
  costId: string;
  name: string;
  type: string;
  size: number;
  url: string | null;
};

type SettlementState = {
  settlementId: string;
  status: string;
  latestVersion: number;
  updatedAt: string;
  analysis: SettlementAnalysis | null;
  draft: unknown;
  uploads: SettlementUpload[];
  attachments: SettlementAttachment[];
};

type StateResponse = { state?: SettlementState | null; message?: string };

const MAX_FILE_SIZE = 25 * 1024 * 1024;

const currency = (value: number | null | undefined) =>
  value == null ? "-" : `${roundWon(value).toLocaleString("ko-KR")}원`;

function Metric({
  label,
  value,
  emphasized,
  description,
}: {
  label: string;
  value: number;
  emphasized?: boolean;
  description?: string;
}) {
  return (
    <Card className={emphasized ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">
          {currency(value)}
        </p>
        {description ? (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function feeRate(fee: number, totalSales: number) {
  if (!totalSales) return "0%";
  return `${new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 2,
  }).format((fee / totalSales) * 100)}%`;
}

function detailTable(headers: string[], rows: Array<Array<string | number>>) {
  if (!rows.length) return "<p>내역 없음</p>";
  return `<table><thead><tr>${headers.map((header) => `<th>${escapePrintHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td class="${typeof cell === "number" ? "number" : ""}">${typeof cell === "number" ? currency(cell) : escapePrintHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function mergeDraftAttachments(
  draftValue: unknown,
  courseName: string,
  attachments: SettlementAttachment[],
) {
  const draft = sanitizeSettlementStatementDraft(draftValue, courseName);
  return {
    ...draft,
    costs: draft.costs.map((cost) => ({
      ...cost,
      attachments: attachments
        .filter((attachment) => attachment.costId === cost.id)
        .map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
          url: attachment.url,
        })),
    })),
  };
}

async function stateRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = (await response.json()) as StateResponse;
  if (!response.ok) {
    throw new Error(body.message ?? "정산 요청을 처리하지 못했습니다.");
  }
  return body.state ?? null;
}

export function CourseSettlementManager({
  courseId,
  courseName,
  instructorName,
}: {
  courseId: string;
  courseName: string;
  instructorName: string;
}) {
  const [settlementId, setSettlementId] = useState("");
  const [uploads, setUploads] = useState<SettlementUpload[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState<SettlementAnalysis | null>(null);
  const [draft, setDraft] = useState<SettlementStatementDraft>(() =>
    sanitizeSettlementStatementDraft(null, courseName),
  );
  const [loading, setLoading] = useState(true);
  const [fileBusy, setFileBusy] = useState(false);
  const [statementBusy, setStatementBusy] = useState(false);
  const [showStatement, setShowStatement] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const applyState = useCallback((state: SettlementState, preserveDraft = false) => {
    setSettlementId(state.settlementId);
    setUploads(state.uploads);
    setAnalysis(state.analysis);
    if (!preserveDraft) {
      const nextDraft = mergeDraftAttachments(
        state.draft,
        courseName,
        state.attachments,
      );
      setDraft(nextDraft);
      if (nextDraft.status === "정산확정") setShowStatement(true);
    }
  }, [courseName]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        let state = await stateRequest(
          `/api/course-settlements?courseId=${encodeURIComponent(courseId)}`,
        );
        if (!state) {
          state = await stateRequest("/api/course-settlements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseId }),
          });
        }
        if (!cancelled && state) applyState(state);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "정산 정보를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [applyState, courseId]);

  const targetInstructor = normalizeName(instructorName);
  const instructor =
    analysis?.instructorResults.find(
      (item) => normalizeName(item.instructor) === targetInstructor,
    ) ?? null;

  function chooseFiles(selected: FileList | null) {
    if (!selected) return;
    setError("");
    const accepted: File[] = [];
    for (const file of Array.from(selected)) {
      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        setError(`${file.name}: .xlsx 파일만 추가할 수 있습니다.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name}: 파일 크기가 25 MiB를 초과합니다.`);
        continue;
      }
      accepted.push(file);
    }
    setPendingFiles(accepted);
  }

  async function uploadAndAnalyze() {
    if (!settlementId || !pendingFiles.length) return;
    setFileBusy(true);
    setError("");
    setNotice("");
    try {
      await saveStatement(draft, false);
      const form = new FormData();
      pendingFiles.forEach((file) => form.append("files", file));
      const state = await stateRequest(
        `/api/course-settlements/${settlementId}/uploads`,
        { method: "POST", body: form },
      );
      if (state) applyState(state);
      setPendingFiles([]);
      setNotice(
        `${pendingFiles.length}개 엑셀의 전체 내역과 '${targetInstructor}' 강사 내역을 검증하고 저장했습니다.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "엑셀을 검증하지 못했습니다.",
      );
    } finally {
      setFileBusy(false);
    }
  }

  async function removeUpload(uploadId: string) {
    if (!settlementId) return;
    setFileBusy(true);
    setError("");
    try {
      await saveStatement(draft, false);
      const state = await stateRequest(
        `/api/course-settlements/${settlementId}/uploads`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        },
      );
      if (state) applyState(state);
      setNotice("정산 엑셀을 제외하고 누적 내역을 다시 계산했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "정산 엑셀을 제외하지 못했습니다.",
      );
    } finally {
      setFileBusy(false);
    }
  }

  async function saveStatement(
    nextDraft: SettlementStatementDraft,
    showNotice = true,
  ) {
    if (!settlementId) throw new Error("정산 정보를 준비하는 중입니다.");
    setStatementBusy(true);
    setError("");
    try {
      const state = await stateRequest(
        `/api/course-settlements/${settlementId}/statement`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: nextDraft }),
        },
      );
      if (!state) throw new Error("저장된 정산서를 확인하지 못했습니다.");
      applyState(state);
      const savedDraft = mergeDraftAttachments(
        state.draft,
        courseName,
        state.attachments,
      );
      if (showNotice) setNotice("비용 내역과 정산서 정보를 저장했습니다.");
      return savedDraft;
    } finally {
      setStatementBusy(false);
    }
  }

  async function uploadAttachments(costId: string, files: File[]) {
    const savedDraft = await saveStatement(draft, false);
    setStatementBusy(true);
    try {
      const form = new FormData();
      form.set("costId", costId);
      files.forEach((file) => form.append("files", file));
      const state = await stateRequest(
        `/api/course-settlements/${settlementId}/attachments`,
        { method: "POST", body: form },
      );
      if (!state) throw new Error("저장된 증빙을 확인하지 못했습니다.");
      applyState(state);
      setNotice(`${files.length}개 증빙 파일을 저장했습니다.`);
      return mergeDraftAttachments(
        state.draft ?? savedDraft,
        courseName,
        state.attachments,
      );
    } finally {
      setStatementBusy(false);
    }
  }

  async function deleteAttachment(attachmentId: string) {
    setStatementBusy(true);
    try {
      const state = await stateRequest(
        `/api/course-settlements/${settlementId}/attachments/${attachmentId}`,
        { method: "DELETE" },
      );
      if (!state) throw new Error("증빙 삭제 결과를 확인하지 못했습니다.");
      applyState(state);
      setNotice("증빙 파일을 삭제했습니다.");
      return mergeDraftAttachments(state.draft, courseName, state.attachments);
    } finally {
      setStatementBusy(false);
    }
  }

  async function confirmStatement(nextDraft: SettlementStatementDraft) {
    await saveStatement(nextDraft, false);
    setStatementBusy(true);
    try {
      const state = await stateRequest(
        `/api/course-settlements/${settlementId}/confirm`,
        { method: "POST" },
      );
      if (!state) throw new Error("정산 확정 결과를 확인하지 못했습니다.");
      applyState(state);
      setNotice("최종 정산서를 확정하고 강의에 저장했습니다.");
      return mergeDraftAttachments(state.draft, courseName, state.attachments);
    } finally {
      setStatementBusy(false);
    }
  }

  function printInstructorReport() {
    if (!instructor || !analysis) return;
    const pgFeeRate = feeRate(instructor.pgFee, instructor.totalSales);
    const novaFeeRate = feeRate(
      instructor.systemNovaFee,
      instructor.totalSales - instructor.pgFee,
    );
    const summaryRows = instructor.monthlySettlements
      .map(
        (month) =>
          `<tr><td>${escapePrintHtml(month.periodLabel)}</td><td>${escapePrintHtml(month.fileName)}</td><td class="number">${currency(month.result.totalSales)}</td><td class="number">${currency(month.result.pgFee)}</td><td class="number">${currency(month.result.systemNovaFee)}</td><td class="number">${currency(month.result.additionalServiceFee)}</td><td class="number">${currency(month.result.finalSettlement)}</td></tr>`,
      )
      .join("");
    const details = analysis.monthlyAnalyses
      .map((month) => {
        const source = month.detailsByInstructor[instructor.instructor];
        if (!source) return "";
        return `<section><h2>${escapePrintHtml(month.periodLabel)} 원본 거래 내역</h2><h3>토스</h3>${detailTable(["일자", "구매자", "결제수단", "상태", "결제·취소액", "PG수수료"], source.toss.map((item) => [item.date, item.buyer, item.paymentMethod, item.status, item.amount, item.pgFee]))}<h3>무통장</h3>${detailTable(["일자", "구매자", "이메일", "전화번호", "결제액", "취소액"], source.cash.map((item) => [item.date, item.buyer, item.email, item.phone, item.paymentAmount, item.cancellationAmount]))}<h3>부가서비스</h3>${detailTable(["이용일", "서비스", "기타 비용", "총계", "비고"], source.service.map((item) => [item.date, item.serviceName, item.otherCost, item.total, item.note]))}</section>`;
      })
      .join("");
    const safeInstructor = instructor.instructor.replace(/[\/:*?"<>|]/gu, "_");
    printHtmlDocument(
      `${safeInstructor}_정산표`,
      `<h1>${escapePrintHtml(instructor.instructor)} 정산표</h1><p class="meta">계산 엔진 ${SETTLEMENT_ENGINE_VERSION} · 누적 총매출 대비 PG사 수수료 ${pgFeeRate} · PG사 수수료 차감 후 매출 대비 노바 수수료 ${novaFeeRate}</p><table><thead><tr><th>기간</th><th>원본</th><th>총매출</th><th>PG수수료</th><th>시스템노바</th><th>부가서비스</th><th>최종 정산금</th></tr></thead><tbody>${summaryRows}<tr class="total"><td colspan="2">누적</td><td class="number">${currency(instructor.totalSales)}</td><td class="number">${currency(instructor.pgFee)}</td><td class="number">${currency(instructor.systemNovaFee)}</td><td class="number">${currency(instructor.additionalServiceFee)}</td><td class="number">${currency(instructor.finalSettlement)}</td></tr></tbody></table>${details}`,
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed">
        <Loader2 className="mr-2 animate-spin" /> 정산 정보를 불러오는 중입니다.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge>엔진 {SETTLEMENT_ENGINE_VERSION}</Badge>
            <Badge variant="outline">강사 {targetInstructor || "미입력"}</Badge>
            {analysis ? (
              <Badge variant={analysis.allMatched ? "default" : "destructive"}>
                전체 검증 {analysis.matchedCount}/{analysis.comparisonCount}
              </Badge>
            ) : (
              <Badge variant="outline">정산 자료 없음</Badge>
            )}
          </div>
          <h2 className="text-xl font-semibold">강의별 정산</h2>
          <p className="mt-2 text-muted-foreground">
            {courseName}의 전체 엑셀과 {targetInstructor || "강사"} 내역을 검증합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Label
            htmlFor={`settlement-files-${courseId}`}
            className="inline-flex h-10 cursor-pointer items-center rounded-md border bg-background px-4 font-medium"
          >
            <FileSpreadsheet className="mr-2 size-4" /> 엑셀 선택
          </Label>
          <Input
            id={`settlement-files-${courseId}`}
            type="file"
            accept=".xlsx"
            multiple
            className="sr-only"
            onChange={(event) => {
              chooseFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <Button
            onClick={uploadAndAnalyze}
            disabled={fileBusy || !settlementId || !pendingFiles.length}
          >
            {fileBusy ? <Loader2 className="animate-spin" /> : <Calculator />}
            검증 및 저장
          </Button>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>처리할 수 없습니다</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>처리 완료</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>정산 엑셀</CardTitle>
          <CardDescription>
            같은 월의 파일을 다시 저장하면 누적 계산에서는 새 파일만 사용합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingFiles.length ? (
            <div className="rounded-md border border-dashed p-3">
              <p className="font-medium">저장 대기 {pendingFiles.length}개</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pendingFiles.map((file) => file.name).join(", ")}
              </p>
            </div>
          ) : null}
          {uploads.length ? (
            uploads.map((upload) => (
              <div
                key={upload.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{upload.periodLabel}</Badge>
                    <span className="truncate font-medium">{upload.fileName}</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  {upload.downloadUrl ? (
                    <Button variant="ghost" size="icon" asChild>
                      <a href={upload.downloadUrl} aria-label={`${upload.fileName} 다운로드`}>
                        <Download />
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={fileBusy}
                    aria-label={`${upload.fileName} 제외`}
                    onClick={() => void removeUpload(upload.id)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              저장된 정산 엑셀이 없습니다.
            </p>
          )}
        </CardContent>
      </Card>

      {analysis ? (
        <>
          <section className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">엑셀 전체 검증</h3>
              <p className="mt-1 text-muted-foreground">
                각 월의 요약 시트와 전체 거래 계산값을 비교합니다.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="전체 총매출" value={analysis.totals.totalSales} />
              <Metric label="PG 수수료" value={analysis.totals.pgFee} />
              <Metric
                label="시스템노바 수수료"
                value={analysis.totals.systemNovaFee}
              />
              <Metric
                label="전체 최종 정산 재원"
                value={analysis.totals.finalSettlement}
                emphasized
              />
            </div>
            {analysis.monthlyAnalyses.map((month) => (
              <Card key={`${month.inputOrder}-${month.fileName}`}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>{month.periodLabel}</CardTitle>
                      <CardDescription>
                        {month.fileName} · 강사 {month.instructorResults.length}명
                      </CardDescription>
                    </div>
                    <Badge variant={month.allMatched ? "default" : "destructive"}>
                      {month.allMatched ? <CheckCircle2 /> : <XCircle />}
                      {month.comparisons.filter((item) => item.matches).length}/8 일치
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>요약 항목</TableHead>
                        <TableHead className="text-right">계산값</TableHead>
                        <TableHead className="text-right">요약값</TableHead>
                        <TableHead className="text-right">차액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {month.comparisons.map((item) => (
                        <TableRow key={item.key}>
                          <TableCell className="font-medium">{item.label}</TableCell>
                          <TableCell className="text-right">
                            {currency(item.calculatedValue)}
                          </TableCell>
                          <TableCell className="text-right">
                            {currency(item.summaryValue)}
                          </TableCell>
                          <TableCell
                            className={`text-right ${item.matches ? "text-emerald-700" : "text-destructive"}`}
                          >
                            {currency(item.difference)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </section>

          <InstructorSettlementSection
            instructor={instructor}
            analysis={analysis}
            targetInstructor={targetInstructor}
            onPrint={printInstructorReport}
          />

          {instructor ? (
            <div className="flex justify-end border-t pt-6">
              <Button size="lg" onClick={() => setShowStatement(true)}>
                <ReceiptText /> 최종 정산하기
              </Button>
            </div>
          ) : null}

          {showStatement && instructor ? (
            <SettlementStatement
              instructor={instructor}
              monthlyAnalyses={analysis.monthlyAnalyses}
              courseName={courseName}
              draft={draft}
              onChange={setDraft}
              onSave={saveStatement}
              onUploadAttachments={uploadAttachments}
              onDeleteAttachment={deleteAttachment}
              onConfirm={confirmStatement}
              busy={statementBusy}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function InstructorSettlementSection({
  instructor,
  analysis,
  targetInstructor,
  onPrint,
}: {
  instructor: AggregatedInstructorSettlement | null;
  analysis: SettlementAnalysis;
  targetInstructor: string;
  onPrint: () => void;
}) {
  if (!instructor) {
    return (
      <Alert variant="destructive">
        <AlertTitle>강사 정산 내역을 찾을 수 없습니다</AlertTitle>
        <AlertDescription>
          강의의 강사명 &apos;{targetInstructor}&apos;과 엑셀의 강사명이 같은지 확인해 주세요.
        </AlertDescription>
      </Alert>
    );
  }

  const pgFeeRate = feeRate(instructor.pgFee, instructor.totalSales);
  const novaFeeRate = feeRate(
    instructor.systemNovaFee,
    instructor.totalSales - instructor.pgFee,
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{instructor.instructor} 누적 정산</h3>
          <p className="mt-1 text-muted-foreground">
            전체 엑셀에서 강사명이 일치하는 거래만 추출한 결과입니다.
          </p>
        </div>
        <Button variant="outline" onClick={onPrint}>
          <Printer /> 정산표 인쇄/PDF
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="누적 총매출" value={instructor.totalSales} />
        <Metric
          label="누적 PG사 수수료"
          value={instructor.pgFee}
          description={`누적 총매출의 ${pgFeeRate}`}
        />
        <Metric
          label="누적 노바 수수료"
          value={instructor.systemNovaFee}
          description={`PG사 수수료 차감 후 매출의 ${novaFeeRate}`}
        />
        <Metric
          label="누적 최종 정산금"
          value={instructor.finalSettlement}
          emphasized
        />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>기간</TableHead>
                <TableHead className="text-right">추출 거래</TableHead>
                <TableHead className="text-right">토스매출</TableHead>
                <TableHead className="text-right">현금매출</TableHead>
                <TableHead className="text-right">PG수수료</TableHead>
                <TableHead className="text-right">부가서비스</TableHead>
                <TableHead className="text-right">최종 정산금</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructor.monthlySettlements.map((month) => {
                const details = analysis.monthlyAnalyses.find(
                  (item) => item.fileName === month.fileName,
                )?.detailsByInstructor[instructor.instructor];
                const rowCount = details
                  ? details.toss.length + details.cash.length + details.service.length
                  : 0;
                return (
                  <TableRow key={month.fileName}>
                    <TableCell>{month.periodLabel}</TableCell>
                    <TableCell className="text-right">{rowCount}건</TableCell>
                    <TableCell className="text-right">
                      {currency(month.result.tossSales)}
                    </TableCell>
                    <TableCell className="text-right">
                      {currency(month.result.cashSales)}
                    </TableCell>
                    <TableCell className="text-right">
                      {currency(month.result.pgFee)}
                    </TableCell>
                    <TableCell className="text-right">
                      {currency(month.result.additionalServiceFee)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {currency(month.result.finalSettlement)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
