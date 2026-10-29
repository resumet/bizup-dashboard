"use client";

import {
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Save,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  formatMeaningSheetSourceCell,
} from "@/lib/admin/meaning-sheet-metrics";
import {
  buildAdPerformanceTableHeaders,
  adPerformanceTableRow,
  adPerformanceTableTotals,
  formatAdPerformanceTableCell,
} from "@/lib/ad-performance/sheet-table";
import {
  AD_PERFORMANCE_VISIBLE_SOURCE_COLUMN_COUNT,
  canonicalGoogleSpreadsheetUrl,
  extractGoogleSpreadsheetId,
} from "@/lib/ad-performance/sheet-workspace";
import type {
  AdPerformanceSheetState,
} from "@/lib/ad-performance/types";
import { cn } from "@/lib/utils";
import { SheetUpdateDialog } from "@/components/ad-performance/sheet-update-dialog";
import type { SheetUpdatePreview } from "@/lib/ad-performance/sheet-update";

const HEADER_ROW_COUNT = 2;
const PAGE_SIZE = 100;
const TRACKING_FILE_EXTENSION = /\.(xlsx|csv)$/iu;
const TABLE_TEXT_SIZES = [
  { body: 9, header: 8, headerRow: 26 },
  { body: 10, header: 9, headerRow: 28 },
  { body: 12, header: 11, headerRow: 32 },
  { body: 14, header: 13, headerRow: 38 },
  { body: 16, header: 15, headerRow: 44 },
] as const;

type SelectedDate = {
  key: string;
  label: string;
};

type ManualInputDraft = {
  chatMembersCumulative: string;
};

const EMPTY_MANUAL_INPUT_DRAFT: ManualInputDraft = {
  chatMembersCumulative: "",
};

function formatInteger(value: number | null | undefined) {
  return value === null || value === undefined
    ? ""
    : value.toLocaleString("ko-KR");
}

function metricCellClass(column: number, channelCount: number) {
  if (column === 12 || column === 13) return "bg-violet-500/[0.03]";
  if (column < 16) return "";
  if (column < 18) return "bg-sky-500/[0.03]";
  if (column === 18) return "bg-blue-500/[0.04] font-semibold";
  if (column < 20 + channelCount) return "bg-emerald-500/[0.03]";
  if (column === 20 + channelCount) return "bg-amber-500/[0.05] font-semibold";
  if (column < 25 + channelCount) return "bg-violet-500/[0.03]";
  if (column < 28 + channelCount) return "bg-orange-500/[0.03]";
  return "bg-indigo-500/[0.03]";
}

function parseNonnegativeInteger(value: string, label: string) {
  const normalized = value.replace(/,/gu, "").trim();
  if (!normalized) return null;
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(`${label}은 0 이상의 정수로 입력해 주세요.`);
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} 값이 너무 큽니다.`);
  }
  return parsed;
}

type SheetOption = { name: string; rowCount: number };

export function MeaningSheetWorkspace({
  dashboardId,
  dashboardStartDate,
  sheetState,
  toolbarContainer,
  allowTrackingImport = true,
  trackingImportLabel = "유입엑셀추가",
  trackingImportNoun = "유입 엑셀",
  cumulativeDbLabel = "누적비즈업 DB",
}: {
  dashboardId: string;
  dashboardStartDate: string;
  sheetState: AdPerformanceSheetState | null;
  toolbarContainer: HTMLElement | null;
  allowTrackingImport?: boolean;
  trackingImportLabel?: string;
  trackingImportNoun?: string;
  cumulativeDbLabel?: string;
}) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(sheetState?.spreadsheetUrl ?? "");
  const [sheetOptions, setSheetOptions] = useState<SheetOption[]>([]);
  const [selectedSheetName, setSelectedSheetName] = useState(
    sheetState?.sheetName ?? "",
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isTrackingFileDraggedOver, setIsTrackingFileDraggedOver] = useState(false);
  const [busyAction, setBusyAction] = useState<
    "preview" | "connect" | "refresh" | "upload" | "reset" | "manual" | "export" | null
  >(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedDate, setSelectedDate] = useState<SelectedDate | null>(null);
  const [manualInputDraft, setManualInputDraft] =
    useState<ManualInputDraft>(EMPTY_MANUAL_INPUT_DRAFT);
  const [manualInputError, setManualInputError] = useState("");
  const [fullscreenError, setFullscreenError] = useState("");
  const [isTableFullscreen, setIsTableFullscreen] = useState(false);
  const [tableTextSizeIndex, setTableTextSizeIndex] = useState(1);
  const tableFullscreenRef = useRef<HTMLDivElement>(null);
  const trackingFileInputRef = useRef<HTMLInputElement>(null);
  const sheetVersionRef = useRef(sheetState?.version ?? 0);
  const exportInProgressRef = useRef(false);
  const updateInProgressRef = useRef(false);
  const [pendingUpdate, setPendingUpdate] = useState<{
    action: "upload" | "refresh";
    file: File | null;
    preview: SheetUpdatePreview;
  } | null>(null);

  const sourceRows = sheetState?.sourceRows ?? [];
  const tracking = sheetState?.tracking ?? null;
  const manualInputs = sheetState?.manualInputs ?? {};
  const headerRows = sourceRows
    .slice(0, HEADER_ROW_COUNT)
    .map((row) => row.slice(0, AD_PERFORMANCE_VISIBLE_SOURCE_COLUMN_COUNT));
  const headers = buildAdPerformanceTableHeaders(headerRows);
  const dataRows = sourceRows.slice(HEADER_ROW_COUNT);
  const totals = adPerformanceTableTotals(dataRows, dashboardStartDate, sheetState);
  const pageCount = Math.max(1, Math.ceil(dataRows.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const visibleRows = dataRows.slice(start, start + PAGE_SIZE);
  const organicChannels = tracking?.organicChannels ?? [];
  const organicColumnCount = organicChannels.length + 1;
  const cumulativeDbHeading = cumulativeDbLabel.replace(/\s*DB$/u, "");
  const tableTextSize = TABLE_TEXT_SIZES[tableTextSizeIndex];
  const secondHeaderStyle = { top: tableTextSize.headerRow };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsTableFullscreen(
        document.fullscreenElement === tableFullscreenRef.current,
      );
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    sheetVersionRef.current = sheetState?.version ?? 0;
  }, [sheetState?.version]);

  useEffect(() => {
    const controller = new AbortController();
    let checking = false;

    const checkSharedState = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const response = await fetch(
          `/api/ad-performance/${dashboardId}/tracking-import`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!response.ok) return;
        const latest = (await response.json()) as { version?: number };
        if (
          typeof latest.version === "number"
          && latest.version !== sheetVersionRef.current
        ) {
          sheetVersionRef.current = latest.version;
          router.refresh();
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
      } finally {
        checking = false;
      }
    };

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkSharedState();
    };
    const interval = window.setInterval(() => void checkSharedState(), 15_000);
    window.addEventListener("focus", checkSharedState);
    document.addEventListener("visibilitychange", checkWhenVisible);

    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", checkSharedState);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [dashboardId, router]);

  async function errorFromResponse(response: Response, fallback: string) {
    const result = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    return result?.message || fallback;
  }

  function refreshAfterSave(message: string) {
    setNotice(message);
    setPage(1);
    router.refresh();
  }

  async function previewSource() {
    setBusyAction("preview");
    setError("");
    setSheetOptions([]);
    try {
      const response = await fetch(
        `/api/ad-performance/${dashboardId}/source-sheets/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: sourceUrl }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await errorFromResponse(response, "시트 목록을 불러오지 못했습니다."),
        );
      }
      const result = (await response.json()) as {
        sheets: SheetOption[];
        defaultSheetName: string;
      };
      setSheetOptions(result.sheets);
      setSelectedSheetName(result.defaultSheetName);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "시트 목록을 불러오지 못했습니다.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function connectSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSheetName) return void previewSource();
    setBusyAction("connect");
    setError("");
    try {
      const response = await fetch(
        `/api/ad-performance/${dashboardId}/source-sheet`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: sourceUrl, sheetName: selectedSheetName }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await errorFromResponse(response, "원본 시트를 연결하지 못했습니다."),
        );
      }
      setSourceDialogOpen(false);
      refreshAfterSave("원본 시트를 연결했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "원본 시트를 연결하지 못했습니다.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  function openSourceSheet() {
    setError("");
    try {
      const url = canonicalGoogleSpreadsheetUrl(
        extractGoogleSpreadsheetId(sourceUrl),
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "시트를 열지 못했습니다.",
      );
    }
  }

  async function refreshSource() {
    await requestSheetUpdate("refresh", null);
  }

  async function uploadTracking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setError("추가할 엑셀 파일을 선택해 주세요.");
      return;
    }
    await requestSheetUpdate("upload", selectedFile);
  }

  function selectTrackingFile(file: File | null) {
    setIsTrackingFileDraggedOver(false);
    if (!file) return;
    if (!TRACKING_FILE_EXTENSION.test(file.name)) {
      setSelectedFile(null);
      setError(".xlsx 또는 .csv 파일만 업로드할 수 있습니다.");
      if (trackingFileInputRef.current) trackingFileInputRef.current.value = "";
      return;
    }
    setError("");
    setSelectedFile(file);
  }

  function dropTrackingFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (busyAction !== null) return;
    selectTrackingFile(event.dataTransfer.files[0] ?? null);
  }

  function openTrackingFilePicker() {
    if (!trackingFileInputRef.current) return;
    trackingFileInputRef.current.value = "";
    trackingFileInputRef.current.click();
  }

  async function requestSheetUpdate(action: "upload" | "refresh", file: File | null, confirmation?: SheetUpdatePreview) {
    if (updateInProgressRef.current || busyAction !== null) return;
    updateInProgressRef.current = true;
    setBusyAction(action);
    setError("");
    setNotice("");
    try {
      const review = { action: confirmation ? "confirm" : "preview", version: confirmation?.version, fingerprint: confirmation?.fingerprint };
      let body: FormData | string;
      if (action === "upload") {
        if (!file) throw new Error("추가할 엑셀 파일을 선택해 주세요.");
        const formData = new FormData();
        formData.set("file", file);
        formData.set("action", review.action);
        if (confirmation) {
          formData.set("version", String(confirmation.version));
          formData.set("fingerprint", confirmation.fingerprint);
        }
        body = formData;
      } else body = JSON.stringify(review);
      const response = await fetch(
        `/api/ad-performance/${dashboardId}/${action === "upload" ? "tracking-import" : "source-sheet"}`,
        { method: "POST", body, ...(action === "refresh" ? { headers: { "Content-Type": "application/json" } } : {}) },
      );
      const result = await response.json() as { preview?: SheetUpdatePreview; saved?: boolean; message?: string };
      if (result.preview && (response.ok || response.status === 409)) {
        setPendingUpdate({ action, file, preview: result.preview });
        setTrackingDialogOpen(false);
        if (response.status === 409) setError(result.message ?? "변경 내역을 다시 확인해 주세요.");
        return;
      }
      if (!response.ok || !result.saved) throw new Error(result.message || "데이터를 업데이트하지 못했습니다.");
      setPendingUpdate(null);
      setTrackingDialogOpen(false);
      setSelectedFile(null);
      refreshAfterSave("확인한 변경 내역을 과거 날짜까지 반영했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "데이터를 업데이트하지 못했습니다.",
      );
    } finally {
      updateInProgressRef.current = false;
      setBusyAction(null);
    }
  }

  async function resetImport() {
    if (!window.confirm(`저장된 ${trackingImportNoun} 값을 초기화할까요?`)) return;
    setBusyAction("reset");
    setError("");
    try {
      const response = await fetch(
        `/api/ad-performance/${dashboardId}/tracking-import`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(
          await errorFromResponse(response, `${trackingImportNoun}을 초기화하지 못했습니다.`),
        );
      }
      setTrackingDialogOpen(false);
      setSelectedFile(null);
      refreshAfterSave(`${trackingImportNoun}을 초기화했습니다.`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : `${trackingImportNoun}을 초기화하지 못했습니다.`,
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function downloadExcel() {
    if (!sheetState || !dataRows.length || busyAction !== null || exportInProgressRef.current) return;
    exportInProgressRef.current = true;
    setBusyAction("export");
    setError("");
    setNotice("");
    try {
      const { buildAdPerformanceXlsx, adPerformanceExportFileName } = await import("@/lib/ad-performance/export-xlsx");
      const blob = await buildAdPerformanceXlsx(sheetState, dashboardStartDate, { cumulativeDbLabel });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = adPerformanceExportFileName(sheetState.sheetName);
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "엑셀 파일을 다운로드하지 못했습니다.");
    } finally {
      exportInProgressRef.current = false;
      setBusyAction(null);
    }
  }

  async function toggleTableFullscreen() {
    setFullscreenError("");

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      const tableContainer = tableFullscreenRef.current;
      if (!tableContainer?.requestFullscreen) {
        throw new Error("이 브라우저에서는 전체 화면 보기를 지원하지 않습니다.");
      }
      await tableContainer.requestFullscreen();
    } catch (caught) {
      setFullscreenError(
        caught instanceof Error
          ? caught.message
          : "전체 화면으로 전환하지 못했습니다.",
      );
    }
  }

  function openManualInput(label: string, key: string) {
    const saved = manualInputs[key];

    setSelectedDate({ key, label });
    setManualInputDraft({
      chatMembersCumulative: formatInteger(saved?.chatMembersCumulative),
    });
    setManualInputError("");
  }

  async function saveManualInput(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDate) return;

    try {
      setBusyAction("manual");
      const nextInput = {
        chatMembersCumulative: parseNonnegativeInteger(
          manualInputDraft.chatMembersCumulative,
          "톡방누적인원",
        ),
      };
      const response = await fetch(
        `/api/ad-performance/${dashboardId}/sheet-manual-inputs/${selectedDate.key}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextInput),
        },
      );
      if (!response.ok) {
        throw new Error(
          await errorFromResponse(response, "입력값을 저장하지 못했습니다."),
        );
      }
      setSelectedDate(null);
      setManualInputError("");
      refreshAfterSave("날짜별 누적값을 저장했습니다.");
    } catch (caught) {
      setManualInputError(
        caught instanceof Error ? caught.message : "입력값을 저장하지 못했습니다.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  const toolbar = (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={busyAction !== null}
        onClick={() => {
          setSourceUrl(sheetState?.spreadsheetUrl ?? "");
          setSelectedSheetName(sheetState?.sheetName ?? "");
          setSheetOptions([]);
          setError("");
          setSourceDialogOpen(true);
        }}
      >
        <Link2 />원본시트연결
      </Button>
      {allowTrackingImport ? <Button
        type="button"
        variant="outline"
        disabled={!sheetState || busyAction !== null}
        onClick={() => {
          setSelectedFile(null);
          setIsTrackingFileDraggedOver(false);
          if (trackingFileInputRef.current) trackingFileInputRef.current.value = "";
          setError("");
          setTrackingDialogOpen(true);
        }}
      >
        <Upload />{trackingImportLabel}
      </Button> : null}
      <Button
        type="button"
        variant="outline"
        disabled={!sheetState || busyAction !== null}
        onClick={() => void refreshSource()}
      >
        {busyAction === "refresh" ? (
          <Loader2 className="animate-spin" />
        ) : (
          <RefreshCw />
        )}
        데이터 갱신
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!dataRows.length || busyAction !== null}
        onClick={() => void downloadExcel()}
        title="표의 전체 데이터를 엑셀로 다운로드"
      >
        {busyAction === "export" ? <Loader2 className="animate-spin" /> : <Download />}
        {busyAction === "export" ? "엑셀 생성 중" : "엑셀 다운로드"}
      </Button>
    </>
  );

  return (
    <div className="mt-8 flex min-h-0 flex-1 flex-col gap-3">
      {toolbarContainer ? createPortal(toolbar, toolbarContainer) : null}
      {pendingUpdate ? <SheetUpdateDialog
        key={pendingUpdate.preview.fingerprint}
        preview={pendingUpdate.preview}
        busy={busyAction !== null}
        error={error}
        cumulativeDbLabel={cumulativeDbLabel}
        onCancel={() => { setPendingUpdate(null); setError(""); }}
        onConfirm={() => void requestSheetUpdate(pendingUpdate.action, pendingUpdate.file, pendingUpdate.preview)}
      /> : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>처리하지 못했습니다</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      {fullscreenError ? (
        <Alert variant="destructive">
          <AlertTitle>전체 화면을 열지 못했습니다</AlertTitle>
          <AlertDescription>{fullscreenError}</AlertDescription>
        </Alert>
      ) : null}

      {sheetState ? <div
        ref={tableFullscreenRef}
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-auto [&>[data-slot=table-container]]:overflow-visible",
          isTableFullscreen && "h-screen overflow-auto bg-muted/30 p-3",
        )}
      >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-background py-1.5 text-[11px] text-muted-foreground">
            <span>
              Google A:P · 데이터 {dataRows.length.toLocaleString("ko-KR")}행 ·
              페이지당 {PAGE_SIZE}행
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span>
                고정 추가 16열
                {organicChannels.length
                  ? ` · 오가닉 채널 ${organicChannels.length.toLocaleString("ko-KR")}열`
                  : " · 오가닉 채널은 엑셀 추가 후 생성"}
              </span>
              <div
                className="flex items-center overflow-hidden rounded-md border bg-background"
                role="group"
                aria-label="표 글자 크기"
              >
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-7 rounded-none border-r text-xs font-semibold"
                  aria-label="표 글자 크기 줄이기"
                  title="표 글자 크기 줄이기"
                  disabled={tableTextSizeIndex === 0}
                  onClick={() =>
                    setTableTextSizeIndex((current) => Math.max(0, current - 1))
                  }
                >
                  A−
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-7 rounded-none text-xs font-semibold"
                  aria-label="표 글자 크기 키우기"
                  title="표 글자 크기 키우기"
                  disabled={tableTextSizeIndex === TABLE_TEXT_SIZES.length - 1}
                  onClick={() =>
                    setTableTextSizeIndex((current) =>
                      Math.min(TABLE_TEXT_SIZES.length - 1, current + 1),
                    )
                  }
                >
                  A+
                </Button>
                <span className="sr-only" aria-live="polite">
                  현재 표 글자 크기 {tableTextSize.body}픽셀
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2 text-xs"
                aria-pressed={isTableFullscreen}
                title={
                  isTableFullscreen
                    ? "표 전체 화면 종료"
                    : "표를 전체 화면으로 보기"
                }
                onClick={() => void toggleTableFullscreen()}
              >
                {isTableFullscreen ? <Minimize2 /> : <Maximize2 />}
                {isTableFullscreen ? "전체화면 종료" : "전체보기"}
              </Button>
            </div>
          </div>

          <Table
            className="w-max min-w-full border-separate border-spacing-0 tracking-tight [&_td]:h-6 [&_td]:px-0.5 [&_td]:py-0 [&_td]:font-mono [&_td]:tabular-nums [&_th]:px-0.5 [&_th]:py-0.5"
            style={{ fontSize: tableTextSize.body }}
          >
            <TableHeader style={{ fontSize: tableTextSize.header }}>
              <TableRow style={{ height: tableTextSize.headerRow }}>
                {headers.top.map((cell, cellIndex) => (
                  <TableHead
                    key={cell.key}
                    colSpan={cell.columnSpan}
                    rowSpan={cell.rowSpan}
                    className={cn(
                      "sticky top-0 z-20 h-7 min-w-16 whitespace-normal border-r border-b bg-muted text-center leading-tight font-semibold",
                      cellIndex === 0 &&
                        "left-0 z-50 min-w-18 border-r-2 bg-muted shadow-[2px_0_0_0_var(--border)]",
                    )}
                    title={cell.label}
                  >
                    {cell.label}
                  </TableHead>
                ))}
                <TableHead
                  colSpan={2}
                  className="sticky top-0 z-20 h-7 border-r border-b bg-sky-100 text-center leading-tight font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200"
                >
                  랜딩페이지
                  <br />
                  접수된DB
                </TableHead>
                <TableHead
                  rowSpan={HEADER_ROW_COUNT}
                  className="sticky top-0 z-20 min-w-18 whitespace-normal border-r border-b bg-blue-100 text-center leading-tight font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                >
                  랜딩접수총DB
                  <br />
                  (광고)
                </TableHead>
                <TableHead
                  colSpan={organicColumnCount}
                  className="sticky top-0 z-20 h-7 border-r border-b bg-emerald-100 text-center leading-tight font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                >
                  자연유입
                  <br />
                  (오가닉)
                </TableHead>
                <TableHead
                  rowSpan={HEADER_ROW_COUNT}
                  className="sticky top-0 z-20 min-w-14 border-r border-b bg-amber-100 text-center leading-tight font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  DB총합
                </TableHead>
                <TableHead
                  colSpan={2}
                  className="sticky top-0 z-20 h-7 border-r border-b bg-violet-100 text-center leading-tight font-semibold text-violet-900 dark:bg-violet-950 dark:text-violet-200"
                  title="광고집행비용 ÷ 랜딩페이지접수된DB"
                >
                  랜딩DB당
                  <br />
                  단가
                </TableHead>
                <TableHead
                  colSpan={2}
                  className="sticky top-0 z-20 h-7 min-w-32 border-r border-b bg-violet-100 text-center leading-tight font-semibold text-violet-900 dark:bg-violet-950 dark:text-violet-200"
                  title="광고DB당단가 - 랜딩DB당단가"
                >
                  광고DB-랜딩DB
                  <br />
                  단가차이
                </TableHead>
                <TableHead
                  rowSpan={HEADER_ROW_COUNT}
                  className="sticky top-0 z-20 min-w-16 whitespace-normal border-r border-b bg-orange-100 text-center leading-tight font-semibold text-orange-900 dark:bg-orange-950 dark:text-orange-200"
                >
                  {cumulativeDbHeading}
                  <br />
                  DB
                </TableHead>
                <TableHead
                  rowSpan={HEADER_ROW_COUNT}
                  className="sticky top-0 z-20 min-w-16 whitespace-normal border-r border-b bg-orange-100 text-center leading-tight font-semibold text-orange-900 dark:bg-orange-950 dark:text-orange-200"
                >
                  톡방누적
                  <br />
                  인원
                </TableHead>
                <TableHead
                  rowSpan={HEADER_ROW_COUNT}
                  className="sticky top-0 z-20 min-w-16 whitespace-normal border-r border-b bg-orange-100 text-center leading-tight font-semibold text-orange-900 dark:bg-orange-950 dark:text-orange-200"
                  title="오늘 톡방누적인원 - 어제 톡방누적인원"
                >
                  톡방입장
                  <br />
                  인원
                </TableHead>
                <TableHead
                  rowSpan={HEADER_ROW_COUNT}
                  className="sticky top-0 z-20 min-w-20 whitespace-normal border-r border-b bg-indigo-100 text-center leading-tight font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                  title="총광고비 ÷ 랜딩접수총DB(광고)"
                >
                  랜딩접수
                  <br />
                  DB단가
                </TableHead>
                <TableHead
                  rowSpan={HEADER_ROW_COUNT}
                  className="sticky top-0 z-20 min-w-20 whitespace-normal border-b bg-indigo-100 text-center leading-tight font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200"
                  title="총광고비 ÷ 톡방입장인원"
                >
                  톡방접수
                  <br />
                  DB단가
                </TableHead>
              </TableRow>
              <TableRow style={{ height: tableTextSize.headerRow }}>
                {headers.bottom.map((cell) => (
                  <TableHead
                    key={cell.key}
                    colSpan={cell.columnSpan}
                    className="sticky z-20 h-7 min-w-14 max-w-18 whitespace-normal border-r border-b bg-muted/95 text-center leading-tight"
                    style={secondHeaderStyle}
                    title={
                      cell.key === "column-b-detail"
                        ? formatMeaningSheetSourceCell(cell.label, 1)
                        : cell.label
                    }
                  >
                    {cell.key === "column-b-detail"
                      ? formatMeaningSheetSourceCell(cell.label, 1)
                      : cell.label}
                  </TableHead>
                ))}
                <TableHead className="sticky z-20 h-7 min-w-14 border-r border-b bg-sky-50 text-center dark:bg-sky-950/90" style={secondHeaderStyle}>
                  구글
                </TableHead>
                <TableHead className="sticky z-20 h-7 min-w-14 border-r border-b bg-sky-50 text-center dark:bg-sky-950/90" style={secondHeaderStyle}>
                  메타
                </TableHead>
                {organicChannels.map((channel) => (
                  <TableHead
                    key={channel}
                    className="sticky z-20 h-7 min-w-16 max-w-20 whitespace-normal border-r border-b bg-emerald-50 text-center leading-tight dark:bg-emerald-950/90"
                    style={secondHeaderStyle}
                    title={channel}
                  >
                    {channel}
                  </TableHead>
                ))}
                <TableHead className="sticky z-20 h-7 min-w-18 border-r border-b bg-emerald-50 text-center font-semibold dark:bg-emerald-950/90" style={secondHeaderStyle}>
                  오가닉총합
                </TableHead>
                {[
                  "구글광고",
                  "메타광고",
                  "구글광고",
                  "메타광고",
                ].map((label, index) => (
                  <TableHead
                    key={`unit-cost-${index}`}
                    className="sticky z-20 h-7 min-w-16 whitespace-nowrap border-r border-b bg-violet-50 text-center dark:bg-violet-950/90"
                    style={secondHeaderStyle}
                  >
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="bg-primary/10 font-semibold hover:bg-primary/10">
                {totals.map((item, index) => index === 0
                  ? <TableHead key={index} scope="row" className="sticky left-0 z-10 border-r-2 bg-muted text-left font-sans">합계</TableHead>
                  : <TableCell key={index} className="whitespace-nowrap border-r text-right">{formatAdPerformanceTableCell(item)}</TableCell>)}
              </TableRow>
              {visibleRows.map((row, rowIndex) => {
                const sourceRow = start + rowIndex + HEADER_ROW_COUNT + 1;
                const { metricDate, cells } = adPerformanceTableRow(row, dashboardStartDate, sheetState);
                return <TableRow key={sourceRow}>
                  {cells.map((item, columnIndex) => {
                    const displayCell = formatAdPerformanceTableCell(item);
                    return columnIndex === 0 ? <TableCell key={columnIndex} className="sticky left-0 z-10 min-w-18 border-r-2 bg-background shadow-[2px_0_0_0_var(--border)]">
                      {metricDate ? <Button type="button" variant="ghost" size="sm"
                        className="h-5 w-full justify-between gap-0.5 px-0.5 font-semibold text-primary hover:text-primary"
                        style={{ fontSize: "inherit" }}
                        title="톡방누적인원 입력" onClick={() => openManualInput(displayCell, metricDate)}>
                        <span className="whitespace-nowrap">{displayCell}</span><PencilLine className="size-3 opacity-60" />
                      </Button> : <span className="block px-0.5 py-0">{displayCell}</span>}
                    </TableCell> : <TableCell key={columnIndex}
                      className={cn("whitespace-nowrap border-r text-right align-middle leading-tight", metricCellClass(columnIndex, organicChannels.length))}
                      title={displayCell}>{displayCell}</TableCell>;
                  })}
                </TableRow>;
              })}
            </TableBody>
          </Table>

        {pageCount > 1 ? (
          <nav
            className="flex shrink-0 items-center justify-between gap-3 border-t bg-background px-4 py-2"
            aria-label="시트 페이지"
          >
            <p className="text-sm text-muted-foreground">
              {page.toLocaleString("ko-KR")} /{" "}
              {pageCount.toLocaleString("ko-KR")} 페이지
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                이전
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= pageCount}
                onClick={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
              >
                다음
              </Button>
            </div>
          </nav>
        ) : null}
      </div> : (
        <Card className="grid min-h-56 place-items-center p-6 text-sm text-muted-foreground">
          연결된 원본 시트가 없습니다.
        </Card>
      )}

      <Dialog
        open={sourceDialogOpen}
        onOpenChange={(open) => {
          if (busyAction) return;
          setSourceDialogOpen(open);
          if (!open) setError("");
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <form className="grid gap-5" onSubmit={connectSource}>
            <DialogHeader>
              <DialogTitle>원본시트연결</DialogTitle>
              <DialogDescription className="sr-only">
                Google Sheets URL과 가져올 시트를 선택합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ad-source-url">Google Sheets URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="ad-source-url"
                    type="url"
                    autoComplete="off"
                    value={sourceUrl}
                    onChange={(event) => {
                      setSourceUrl(event.target.value);
                      setSheetOptions([]);
                      setSelectedSheetName("");
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!sourceUrl.trim() || busyAction !== null}
                    onClick={() => void previewSource()}
                  >
                    {busyAction === "preview" ? (
                      <Loader2 className="animate-spin" />
                    ) : null}
                    시트 불러오기
                  </Button>
                </div>
              </div>
              {sheetOptions.length ? (
                <div className="grid gap-2">
                  <Label htmlFor="ad-source-sheet">시트</Label>
                  <Select
                    value={selectedSheetName}
                    onValueChange={setSelectedSheetName}
                  >
                    <SelectTrigger id="ad-source-sheet" className="w-full">
                      <SelectValue placeholder="시트 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {sheetOptions.map((sheet) => (
                        <SelectItem key={sheet.name} value={sheet.name}>
                          {sheet.name} ({sheet.rowCount.toLocaleString("ko-KR")}행)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="outline"
                disabled={!sourceUrl.trim() || busyAction !== null}
                onClick={openSourceSheet}
              >
                <ExternalLink />
                시트열기
              </Button>
              <div className="flex gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={busyAction !== null}>
                    취소
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={!selectedSheetName || busyAction !== null}
                >
                  {busyAction === "connect" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Link2 />
                  )}
                  연결
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {allowTrackingImport ? <Dialog
        open={trackingDialogOpen}
        onOpenChange={(open) => {
          if (busyAction) return;
          setTrackingDialogOpen(open);
          if (!open) setError("");
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <form className="grid gap-5" onSubmit={uploadTracking}>
            <DialogHeader>
              <DialogTitle>{trackingImportLabel}</DialogTitle>
              <DialogDescription className="sr-only">
                신청일, 유입경로, 진행매체 열이 있는 엑셀 또는 CSV 파일을 추가합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="ad-tracking-file">엑셀 또는 CSV 파일</Label>
              <input
                ref={trackingFileInputRef}
                id="ad-tracking-file"
                type="file"
                className="sr-only"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                disabled={busyAction !== null}
                onChange={(event) => selectTrackingFile(event.currentTarget.files?.[0] ?? null)}
              />
              <div
                onDragEnter={(event) => {
                  event.preventDefault();
                  if (busyAction === null) setIsTrackingFileDraggedOver(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  if (busyAction === null) setIsTrackingFileDraggedOver(true);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsTrackingFileDraggedOver(false);
                  }
                }}
                onDrop={dropTrackingFile}
                className={cn(
                  "grid min-h-44 place-items-center rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                  isTrackingFileDraggedOver
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/20",
                  busyAction !== null && "pointer-events-none opacity-60",
                )}
              >
                <div className="grid justify-items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-background shadow-sm ring-1 ring-border">
                    <Upload className="size-5 text-muted-foreground" />
                  </span>
                  <div className="space-y-1">
                    <p className="max-w-72 break-all text-sm font-medium">
                      {selectedFile?.name ?? "파일을 여기에 끌어다 놓으세요"}
                    </p>
                    <p className="text-xs text-muted-foreground">.xlsx 또는 .csv</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busyAction !== null}
                    onClick={openTrackingFilePicker}
                  >
                    {selectedFile ? "다른 파일 선택" : "파일 선택"}
                  </Button>
                </div>
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter className="gap-3 sm:flex-col-reverse sm:items-stretch md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {sheetState?.tracking?.sourceStoragePath ? (
                  <Button type="button" variant="outline" asChild>
                    <a
                      href={`/api/ad-performance/${dashboardId}/tracking-import?download=1`}
                      download
                    >
                      <Download />
                      원본파일다운로드
                    </a>
                  </Button>
                ) : (
                  <Button type="button" variant="outline" disabled>
                    <Download />
                    원본파일다운로드
                  </Button>
                )}
                {sheetState?.tracking ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busyAction !== null}
                    onClick={() => void resetImport()}
                  >
                    {busyAction === "reset" ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                    초기화
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={busyAction !== null}>
                    취소
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={!selectedFile || busyAction !== null}
                >
                  {busyAction === "upload" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Upload />
                  )}
                  변경 내역 확인
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog> : null}

      <Dialog
        open={selectedDate !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDate(null);
            setManualInputError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form className="grid gap-5" onSubmit={saveManualInput}>
            <DialogHeader>
              <DialogTitle>{selectedDate?.label ?? "날짜별 상세 입력"}</DialogTitle>
              <DialogDescription className="sr-only">
                톡방누적인원을 저장합니다.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="meaning-chat-members-cumulative">
                  톡방누적인원
                </Label>
                <Input
                  id="meaning-chat-members-cumulative"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="예: 180"
                  value={manualInputDraft.chatMembersCumulative}
                  onChange={(event) =>
                    setManualInputDraft((current) => ({
                      ...current,
                      chatMembersCumulative: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            {manualInputError ? (
              <p className="text-sm text-destructive" role="alert">
                {manualInputError}
              </p>
            ) : null}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  취소
                </Button>
              </DialogClose>
              <Button type="submit" disabled={busyAction !== null}>
                {busyAction === "manual" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Save />
                )}
                저장
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
