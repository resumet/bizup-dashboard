"use client";

import { useMemo, useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import {
  ChartNoAxesCombined,
  FileSpreadsheet,
  FolderOpen,
  History,
  Loader2,
  ReceiptText,
  Repeat2,
  Save,
  Trash2,
  UsersRound,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analyzeSettlements,
  buildRevenueStrategies,
  parseSettlementRows,
  type SettlementGroup,
  type SettlementRow,
} from "@/lib/settlements/analysis";
import {
  parseStoredSettlementRows,
  type SettlementReportSummary,
} from "@/lib/settlements/storage";

const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function currency(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums">
          {currency(value)}
        </p>
      </CardContent>
    </Card>
  );
}

function FrequencyBars({
  items,
}: {
  items: Array<{ name: string; count: number }>;
}) {
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={item.name}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium">
              {index === 0 ? "1위 · " : ""}
              {item.name}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {item.count.toLocaleString("ko-KR")}건
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RevenueTrend({ items }: { items: SettlementGroup[] }) {
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const width = 900;
  const height = 280;
  const padding = 28;
  const max = Math.max(...items.map((item) => item.salesAmount), 1);
  const points = items.reduce<
    Array<
      SettlementGroup & {
        cumulativeSalesAmount: number;
        cumulativeCount: number;
        x: number;
        y: number;
      }
    >
  >((result, item, index) => {
    const previous = result.at(-1);
    return [
      ...result,
      {
      ...item,
      cumulativeSalesAmount:
        (previous?.cumulativeSalesAmount ?? 0) + item.salesAmount,
      cumulativeCount: (previous?.cumulativeCount ?? 0) + item.count,
      x:
        items.length === 1
          ? width / 2
          : padding + (index / (items.length - 1)) * (width - padding * 2),
      y: height - padding - (item.salesAmount / max) * (height - padding * 2),
      },
    ];
  }, []);
  const hoveredPoint =
    hoveredPointIndex === null ? null : points[hoveredPointIndex];
  const tooltipWidth = 250;
  const tooltipHeight = 118;
  const tooltipX = hoveredPoint
    ? Math.min(
        Math.max(hoveredPoint.x - tooltipWidth / 2, 8),
        width - tooltipWidth - 8,
      )
    : 0;
  const tooltipY = hoveredPoint
    ? Math.min(
        Math.max(
          hoveredPoint.y < height / 2
            ? hoveredPoint.y + 12
            : hoveredPoint.y - tooltipHeight - 12,
          8,
        ),
        height - tooltipHeight - 8,
      )
    : 0;
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[720px]"
        role="img"
        aria-label="매출일별 매출금액 추이"
      >
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          className="stroke-border"
        />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-primary"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
        />
        {points.map((point, index) => (
          <g key={point.name}>
            <circle
              cx={point.x}
              cy={point.y}
              r="14"
              fill="transparent"
              tabIndex={0}
              className="cursor-pointer outline-none"
              aria-label={`${point.name}, 매출금액 ${currency(point.salesAmount)}, 결제 건수 ${point.count.toLocaleString("ko-KR")}건, 누적 매출 ${currency(point.cumulativeSalesAmount)}, 누적 건수 ${point.cumulativeCount.toLocaleString("ko-KR")}건`}
              onMouseEnter={() => setHoveredPointIndex(index)}
              onMouseLeave={() => setHoveredPointIndex(null)}
              onFocus={() => setHoveredPointIndex(index)}
              onBlur={() => setHoveredPointIndex(null)}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={hoveredPointIndex === index ? 6 : 4}
              fill="currentColor"
              className="pointer-events-none text-primary"
            />
            <title>
              {point.name} · 매출금액 {currency(point.salesAmount)} · 결제 건수{" "}
              {point.count.toLocaleString("ko-KR")}건 · 누적 매출{" "}
              {currency(point.cumulativeSalesAmount)} · 누적 건수{" "}
              {point.cumulativeCount.toLocaleString("ko-KR")}건
            </title>
          </g>
        ))}
        {hoveredPoint ? (
          <g className="pointer-events-none" aria-hidden="true">
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={tooltipHeight}
              rx="10"
              className="fill-popover stroke-border drop-shadow-sm"
            />
            <text
              x={tooltipX + 14}
              y={tooltipY + 22}
              className="fill-foreground text-[13px] font-semibold"
            >
              {hoveredPoint.name}
            </text>
            <text x={tooltipX + 14} y={tooltipY + 45} className="fill-foreground text-xs">
              매출금액 {currency(hoveredPoint.salesAmount)}
            </text>
            <text x={tooltipX + 14} y={tooltipY + 65} className="fill-foreground text-xs">
              결제 건수 {hoveredPoint.count.toLocaleString("ko-KR")}건
            </text>
            <text x={tooltipX + 14} y={tooltipY + 85} className="fill-foreground text-xs">
              누적 매출 {currency(hoveredPoint.cumulativeSalesAmount)}
            </text>
            <text x={tooltipX + 14} y={tooltipY + 105} className="fill-foreground text-xs">
              누적 건수 {hoveredPoint.cumulativeCount.toLocaleString("ko-KR")}건
            </text>
          </g>
        ) : null}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{items[0]?.name ?? "-"}</span>
        <span>{items.at(-1)?.name ?? "-"}</span>
      </div>
    </div>
  );
}

function GroupTable({
  title,
  items,
}: {
  title: string;
  items: SettlementGroup[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead className="text-right">건수</TableHead>
              <TableHead className="text-right">매출금액</TableHead>
              <TableHead className="text-right">PG 수수료</TableHead>
              <TableHead className="text-right">노바 수수료</TableHead>
              <TableHead className="text-right">정산금액</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.name}>
                <TableCell className="min-w-48 font-medium">
                  {item.name}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.count.toLocaleString("ko-KR")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency(item.salesAmount)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency(item.pgFee)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {currency(item.novaFee)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {currency(item.settlementAmount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SavedReportsCard({
  reports,
  activeReportId,
  loadingReportId,
  reportError,
  reportLoadError,
  onOpen,
  onDelete,
}: {
  reports: SettlementReportSummary[];
  activeReportId: string;
  loadingReportId: string;
  reportError: string;
  reportLoadError?: string;
  onOpen: (report: SettlementReportSummary) => void;
  onDelete: (report: SettlementReportSummary) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <History />
          저장된 정산 분석
          <Badge variant="secondary">{reports.length.toLocaleString("ko-KR")}개</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {reportLoadError ? (
          <Alert variant="destructive">
            <AlertTitle>저장 목록을 불러올 수 없습니다</AlertTitle>
            <AlertDescription>{reportLoadError}</AlertDescription>
          </Alert>
        ) : null}
        {reportError ? (
          <Alert variant="destructive">
            <AlertTitle>저장된 분석을 처리할 수 없습니다</AlertTitle>
            <AlertDescription>{reportError}</AlertDescription>
          </Alert>
        ) : null}
        {reports.length === 0 ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            아직 저장된 정산 분석이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>분석 이름</TableHead>
                  <TableHead>원본 파일</TableHead>
                  <TableHead className="text-right">집계 행</TableHead>
                  <TableHead>저장일</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {report.name}
                        {activeReportId === report.id ? <Badge>열림</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-muted-foreground">
                      {report.original_filename || "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {report.row_count.toLocaleString("ko-KR")}건
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {REPORT_DATE_FORMATTER.format(new Date(report.created_at))}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpen(report)}
                          disabled={Boolean(loadingReportId)}
                        >
                          {loadingReportId === report.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <FolderOpen />
                          )}
                          열기
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onDelete(report)}
                          disabled={Boolean(loadingReportId)}
                        >
                          <Trash2 />삭제
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteReportDialog({
  target,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  target: SettlementReportSummary | null;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>저장된 정산 분석을 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            &apos;{target?.name}&apos;의 저장 데이터가 삭제됩니다. 원본 엑셀 파일은
            삭제되지 않으며 이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {deleting ? "삭제 중..." : "삭제"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SettlementDashboard({
  initialReports,
  reportLoadError,
}: {
  initialReports: SettlementReportSummary[];
  reportLoadError?: string;
}) {
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [reportName, setReportName] = useState("");
  const [reports, setReports] = useState(initialReports);
  const [activeReportId, setActiveReportId] = useState("");
  const [loadingReportId, setLoadingReportId] = useState("");
  const [savingReport, setSavingReport] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<SettlementReportSummary | null>(null);
  const [deletingReport, setDeletingReport] = useState(false);
  const [reportError, setReportError] = useState("");
  const [instructor, setInstructor] = useState("all");
  const [course, setCourse] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const instructors = useMemo(
    () =>
      [...new Set(rows.map((row) => row.instructor))].toSorted((a, b) =>
        a.localeCompare(b, "ko"),
      ),
    [rows],
  );
  const courses = useMemo(
    () =>
      [
        ...new Set(
          rows
            .filter(
              (row) => instructor === "all" || row.instructor === instructor,
            )
            .map((row) => row.course),
        ),
      ].toSorted((a, b) => a.localeCompare(b, "ko")),
    [rows, instructor],
  );
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (instructor === "all" || row.instructor === instructor) &&
          (course === "all" || row.course === course),
      ),
    [rows, instructor, course],
  );
  const analysis = useMemo(
    () => analyzeSettlements(filteredRows),
    [filteredRows],
  );
  const strategies = useMemo(
    () => buildRevenueStrategies(filteredRows),
    [filteredRows],
  );

  async function upload(file?: File) {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const sheets = await readXlsxFile(file);
      const target =
        sheets.find((sheet) => sheet.sheet === "정산 상세 내역") ?? sheets[0];
      if (!target) throw new Error("엑셀 시트를 찾을 수 없습니다.");
      const parsed = parseSettlementRows(target.data as unknown[][]);
      setRows(parsed);
      setFileName(file.name);
      setReportName(file.name.replace(/\.xlsx$/iu, ""));
      setActiveReportId("");
      setReportError("");
      setInstructor("all");
      setCourse("all");
    } catch (caught) {
      setRows([]);
      setFileName("");
      setReportName("");
      setActiveReportId("");
      setError(
        caught instanceof Error
          ? caught.message
          : "엑셀을 분석하지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveReport() {
    if (!reportName.trim() || rows.length === 0 || savingReport) return;
    setSavingReport(true);
    setReportError("");
    try {
      const response = await fetch("/api/settlement-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reportName.trim(),
          originalFilename: fileName,
          rows,
        }),
      });
      const body = (await response.json()) as {
        report?: SettlementReportSummary;
        message?: string;
      };
      if (!response.ok || !body.report) {
        throw new Error(body.message || "정산 분석을 저장하지 못했습니다.");
      }
      setReports((current) => [
        body.report!,
        ...current.filter((report) => report.id !== body.report!.id),
      ]);
      setActiveReportId(body.report.id);
    } catch (caught) {
      setReportError(
        caught instanceof Error
          ? caught.message
          : "정산 분석을 저장하지 못했습니다.",
      );
    } finally {
      setSavingReport(false);
    }
  }

  async function openReport(report: SettlementReportSummary) {
    setLoadingReportId(report.id);
    setReportError("");
    try {
      const response = await fetch(`/api/settlement-reports/${report.id}`);
      const body = (await response.json()) as {
        report?: SettlementReportSummary & { rows: unknown };
        message?: string;
      };
      if (!response.ok || !body.report) {
        throw new Error(body.message || "저장된 정산 분석을 불러오지 못했습니다.");
      }
      const storedRows = parseStoredSettlementRows(body.report.rows);
      setRows(storedRows);
      setFileName(body.report.original_filename);
      setReportName(body.report.name);
      setActiveReportId(body.report.id);
      setInstructor("all");
      setCourse("all");
    } catch (caught) {
      setReportError(
        caught instanceof Error
          ? caught.message
          : "저장된 정산 분석을 불러오지 못했습니다.",
      );
    } finally {
      setLoadingReportId("");
    }
  }

  async function deleteReport() {
    if (!deleteTarget || deletingReport) return;
    setDeletingReport(true);
    setReportError("");
    try {
      const response = await fetch(
        `/api/settlement-reports/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message || "저장된 정산 분석을 삭제하지 못했습니다.");
      }
      const deletedId = deleteTarget.id;
      setReports((current) => current.filter((report) => report.id !== deletedId));
      setDeleteTarget(null);
      if (activeReportId === deletedId) {
        setRows([]);
        setFileName("");
        setReportName("");
        setActiveReportId("");
        setInstructor("all");
        setCourse("all");
      }
    } catch (caught) {
      setReportError(
        caught instanceof Error
          ? caught.message
          : "저장된 정산 분석을 삭제하지 못했습니다.",
      );
      setDeleteTarget(null);
    } finally {
      setDeletingReport(false);
    }
  }

  const savedReportsCard = (
    <SavedReportsCard
      reports={reports}
      activeReportId={activeReportId}
      loadingReportId={loadingReportId}
      reportError={reportError}
      reportLoadError={reportLoadError}
      onOpen={(report) => void openReport(report)}
      onDelete={setDeleteTarget}
    />
  );

  const deleteReportDialog = (
    <DeleteReportDialog
      target={deleteTarget}
      deleting={deletingReport}
      onOpenChange={(open) => {
        if (!open && !deletingReport) setDeleteTarget(null);
      }}
      onConfirm={() => void deleteReport()}
    />
  );

  if (rows.length === 0) {
    return (
      <div className="space-y-5">
        {savedReportsCard}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>파일을 분석할 수 없습니다</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Card className="border-dashed">
          <CardContent className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
            <span className="mb-5 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <FileSpreadsheet />
              )}
            </span>
            <h2 className="text-xl font-semibold">
              정산 상세 엑셀을 선택하세요
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              파일은 브라우저에서 분석하며, 강사·강의·결제 정보와 중복 구매자를
              집계합니다.
            </p>
            <Label
              htmlFor="settlement-file"
              className="mt-6 cursor-pointer rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              엑셀 파일 선택
            </Label>
            <Input
              id="settlement-file"
              type="file"
              accept=".xlsx"
              className="sr-only"
              disabled={loading}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </CardContent>
        </Card>
        {deleteReportDialog}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {savedReportsCard}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="min-w-0 flex-1">
            <Badge variant="secondary">
              {rows.length.toLocaleString("ko-KR")}건
            </Badge>
            <p className="mt-2 truncate font-medium">{fileName}</p>
          </div>
          <div className="grid gap-1.5 lg:w-64">
            <Label htmlFor="settlement-report-name">저장 이름</Label>
            <Input
              id="settlement-report-name"
              value={reportName}
              maxLength={200}
              disabled={Boolean(activeReportId) || savingReport}
              onChange={(event) => setReportName(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant={activeReportId ? "secondary" : "default"}
            onClick={() => void saveReport()}
            disabled={
              Boolean(activeReportId) ||
              savingReport ||
              !reportName.trim() ||
              Boolean(reportLoadError)
            }
          >
            {savingReport ? <Loader2 className="animate-spin" /> : <Save />}
            {activeReportId ? "저장됨" : savingReport ? "저장 중..." : "분석 저장"}
          </Button>
          <div className="grid gap-2 sm:grid-cols-2 lg:w-[560px]">
            <div className="grid gap-1.5">
              <Label>강사</Label>
              <Select
                value={instructor}
                onValueChange={(value) => {
                  setInstructor(value);
                  setCourse("all");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 강사</SelectItem>
                  {instructors.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>강의</Label>
              <Select value={course} onValueChange={setCourse}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 강의</SelectItem>
                  {courses.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Label
            htmlFor="settlement-file-replace"
            className="cursor-pointer rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted"
          >
            파일 교체
          </Label>
          <Input
            id="settlement-file-replace"
            type="file"
            accept=".xlsx"
            className="sr-only"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="전체 매출금액" value={analysis.totals.salesAmount} />
        <MetricCard title="PG사 수수료" value={analysis.totals.pgFee} />
        <MetricCard title="노바 수수료금액" value={analysis.totals.novaFee} />
        <MetricCard title="정산금액" value={analysis.totals.settlementAmount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChartNoAxesCombined />
            매출 추이
          </CardTitle>
        </CardHeader>
        <CardContent>
          {analysis.trend.length ? (
            <RevenueTrend items={analysis.trend} />
          ) : (
            <p className="text-sm text-muted-foreground">
              매출일 데이터가 없습니다.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText />
              할부개월수 분포
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FrequencyBars items={analysis.installments} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText />
              결제수단 분포
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FrequencyBars items={analysis.paymentMethods} />
          </CardContent>
        </Card>
      </div>

      <GroupTable title="강사별 정산" items={analysis.instructors} />
      <GroupTable title="강의별 정산" items={analysis.courses} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat2 />
            중복 결제 수강생{" "}
            <Badge variant="secondary">
              {analysis.duplicates.length.toLocaleString("ko-KR")}명
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>회원명</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead className="text-right">결제 횟수</TableHead>
                <TableHead className="text-right">매출금액</TableHead>
                <TableHead>강의</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.duplicates.map((person) => (
                <TableRow key={person.email || person.name}>
                  <TableCell className="font-medium">
                    {person.name || "이름 없음"}
                  </TableCell>
                  <TableCell>{person.email || "이메일 없음"}</TableCell>
                  <TableCell className="text-right">
                    {person.purchaseCount}회
                  </TableCell>
                  <TableCell className="text-right">
                    {currency(person.salesAmount)}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">
                    {person.courses.join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRound />
            매출 확대 전략 3가지
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          {strategies.map((strategy, index) => (
            <div
              key={strategy.title}
              className="rounded-xl border bg-muted/30 p-5"
            >
              <Badge>{index + 1}</Badge>
              <h3 className="mt-3 font-semibold">{strategy.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {strategy.description}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
      {deleteReportDialog}
    </div>
  );
}
