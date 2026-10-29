"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardPaste, ExternalLink, FileImage, Loader2, Paperclip, PencilLine, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateBurden, calculateTax } from "@/lib/course-costs/calculation";
import { YoutubeAppearanceFeeDialog } from "@/components/course-costs/youtube-appearance-fee-dialog";
import { YoutubeRsCostDialog } from "@/components/course-costs/youtube-rs-cost-dialog";
import { youtubeAppearanceFeeTotals } from "@/lib/course-costs/youtube-appearance-fee";
import { youtubeRsTotals } from "@/lib/course-costs/youtube-rs";
import {
  COURSE_COST_DEFAULT_CATEGORIES,
  type CourseCost,
  type CourseCostAttachment,
  type CourseCostBurden,
  type CourseCostInput,
  type YoutubeAppearanceFeeCostDetails,
  type YoutubeRsCostDetails,
} from "@/lib/course-costs/types";

type FixedBurden = Exclude<CourseCostBurden, "UNCLASSIFIED">;
type CostResponse = { costs: CourseCost[]; locked: boolean };
type CostDraft = { key: string; id: string | null; value: CourseCostInput; attachments: CourseCostAttachment[] };
type DeletedCost = { id: string; version: number };

const BURDENS: Array<{ value: FixedBurden; label: string }> = [
  { value: "COMPANY", label: "회사 부담" },
  { value: "SHARED", label: "회사·강사 공동 부담" },
  { value: "INSTRUCTOR", label: "강사 부담" },
];
const money = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const COST_ROW_GRID = "grid items-start gap-2 xl:grid-cols-[210px_160px_minmax(180px,0.8fr)_130px_180px_152px]";
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx";
const ATTACHMENT_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function attachmentExtension(file: File) {
  return file.name.toLowerCase().match(/\.([^.]+)$/u)?.[1] ?? "";
}

function validateAttachment(file: File) {
  const expectedMime = ATTACHMENT_MIME_BY_EXTENSION[attachmentExtension(file)];
  if (!expectedMime || (file.type && file.type !== expectedMime)) throw new Error(`${file.name}: PDF, JPG, JPEG, PNG, WEBP, XLS, XLSX만 첨부할 수 있습니다.`);
  if (file.size < 1 || file.size > MAX_ATTACHMENT_SIZE) throw new Error(`${file.name}: 파일은 20MB 이하여야 합니다.`);
}

function clipboardImageName(type: string, index: number) {
  const extension = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replaceAll(/[-: ]/gu, "").slice(0, 14);
  return `클립보드-${stamp}${index ? `-${index + 1}` : ""}.${extension}`;
}

function emptyInput(burdenType: FixedBurden, categoryCode = "CUSTOM", name = ""): CourseCostInput {
  return {
    categoryCode, name, burdenType, managerUserId: null, managerName: "", grossAmount: 0,
    taxType: "TAXABLE", paidDate: "", status: "PLANNED", evidenceRequired: false,
    evidenceNeedsReview: false, evidenceTypes: [], otherEvidenceType: "",
    companyShareRate: burdenType === "COMPANY" ? 100 : burdenType === "SHARED" ? 50 : 0,
    instructorShareRate: burdenType === "INSTRUCTOR" ? 100 : burdenType === "SHARED" ? 50 : 0,
    includeInSettlement: true, note: "", calculationDetails: null,
  };
}

function editableCost(cost: CourseCost, sectionBurden?: FixedBurden): CourseCostInput {
  return {
    categoryCode: cost.categoryCode,
    name: cost.name,
    burdenType: cost.burdenType === "UNCLASSIFIED" ? sectionBurden ?? "COMPANY" : cost.burdenType,
    managerUserId: cost.managerUserId,
    managerName: cost.managerName,
    grossAmount: cost.grossAmount,
    taxType: "TAXABLE",
    paidDate: cost.paidDate,
    status: cost.status,
    evidenceRequired: false,
    evidenceNeedsReview: false,
    evidenceTypes: [],
    otherEvidenceType: "",
    companyShareRate: cost.companyShareRate,
    instructorShareRate: cost.instructorShareRate,
    includeInSettlement: true,
    note: "",
    calculationDetails: cost.calculationDetails,
    version: cost.version,
  };
}

function draftsFromCosts(costs: CourseCost[]): CostDraft[] {
  return costs.map((cost) => ({ key: cost.id, id: cost.id, value: editableCost(cost), attachments: cost.attachments }));
}

function belongsToSection(value: CourseCostInput, burdenType: FixedBurden) {
  return value.burdenType === burdenType || (burdenType === "COMPANY" && value.burdenType === "UNCLASSIFIED");
}

function todayInSeoul() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json() as CostResponse & { message?: string };
  if (!response.ok) throw new Error(body.message ?? "비용 요청에 실패했습니다.");
  return body;
}

export function CourseCostManager({ courseId }: { courseId: string }) {
  const [costs, setCosts] = useState<CourseCost[]>([]);
  const [drafts, setDrafts] = useState<CostDraft[]>([]);
  const [deleted, setDeleted] = useState<DeletedCost[]>([]);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [youtubeRsOpen, setYoutubeRsOpen] = useState(false);
  const [youtubeRsTargetKey, setYoutubeRsTargetKey] = useState<string | null>(null);
  const [youtubeRsInitialDetails, setYoutubeRsInitialDetails] = useState<YoutubeRsCostDetails | null>(null);
  const [youtubeAppearanceFeeOpen, setYoutubeAppearanceFeeOpen] = useState(false);
  const [youtubeAppearanceFeeTargetKey, setYoutubeAppearanceFeeTargetKey] = useState<string | null>(null);
  const [youtubeAppearanceFeeInitialDetails, setYoutubeAppearanceFeeInitialDetails] = useState<YoutubeAppearanceFeeCostDetails | null>(null);

  useEffect(() => {
    let cancelled = false;
    void request(`/api/course-operations/${courseId}/costs`).then((body) => {
      if (cancelled) return;
      setCosts(body.costs);
      setDrafts(draftsFromCosts(body.costs));
      setDeleted([]);
      setDirtyKeys(new Set());
      setLocked(body.locked);
    }, (reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "비용을 불러오지 못했습니다.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId]);

  const changeCount = dirtyKeys.size + deleted.length;

  const summary = useMemo(() => drafts.reduce((result, draft) => {
    if (draft.value.status === "CANCELED") return result;
    const tax = calculateTax(draft.value.grossAmount, "TAXABLE");
    const burden = calculateBurden(draft.value.grossAmount, draft.value.burdenType, draft.value.companyShareRate);
    result.total += draft.value.grossAmount;
    result.supply += tax.supplyAmount;
    result.vat += tax.vatAmount;
    result.company += burden.companyShareAmount;
    result.instructor += burden.instructorShareAmount;
    return result;
  }, { total: 0, supply: 0, vat: 0, company: 0, instructor: 0 }), [drafts]);

  function resetFromServer(body: CostResponse, message: string) {
    setCosts(body.costs);
    setDrafts(draftsFromCosts(body.costs));
    setDeleted([]);
    setDirtyKeys(new Set());
    setLocked(body.locked);
    setNotice(message);
  }

  function applyAttachmentResponse(body: CostResponse, message: string) {
    setCosts(body.costs);
    setLocked(body.locked);
    const latest = new Map(body.costs.map((cost) => [cost.id, cost]));
    setDrafts((current) => current.map((draft) => {
      const serverCost = draft.id ? latest.get(draft.id) : undefined;
      return serverCost ? { ...draft, attachments: serverCost.attachments } : draft;
    }));
    setNotice(message);
  }

  function addDraft(burdenType: FixedBurden, categoryCode = "CUSTOM", name = "") {
    const key = crypto.randomUUID();
    setDrafts((current) => [...current, { key, id: null, value: emptyInput(burdenType, categoryCode, name), attachments: [] }]);
    setDirtyKeys((current) => new Set(current).add(key));
    setNotice("");
  }

  function openYoutubeRsDialog(draft?: CostDraft) {
    setYoutubeRsTargetKey(draft?.key ?? null);
    setYoutubeRsInitialDetails(draft?.value.calculationDetails?.kind === "YOUTUBE_RS" ? draft.value.calculationDetails : null);
    setYoutubeRsOpen(true);
  }

  function openYoutubeAppearanceFeeDialog(draft?: CostDraft) {
    setYoutubeAppearanceFeeTargetKey(draft?.key ?? null);
    setYoutubeAppearanceFeeInitialDetails(
      draft?.value.calculationDetails?.kind === "YOUTUBE_APPEARANCE_FEE" ? draft.value.calculationDetails : null,
    );
    setYoutubeAppearanceFeeOpen(true);
  }

  function applyYoutubeRs(details: YoutubeRsCostDetails) {
    const grossAmount = youtubeRsTotals(details).feeAmount;
    const patch: Partial<CourseCostInput> = {
      categoryCode: "YOUTUBE_RS",
      name: "유튜브 RS",
      managerName: "유튜브",
      grossAmount,
      calculationDetails: details,
    };
    if (youtubeRsTargetKey) {
      updateDraft(youtubeRsTargetKey, patch);
    } else {
      const key = crypto.randomUUID();
      setDrafts((current) => [...current, {
        key,
        id: null,
        value: { ...emptyInput("SHARED", "YOUTUBE_RS", "유튜브 RS"), ...patch },
        attachments: [],
      }]);
      setDirtyKeys((current) => new Set(current).add(key));
      setNotice("");
    }
    setYoutubeRsOpen(false);
  }

  function applyYoutubeAppearanceFee(details: YoutubeAppearanceFeeCostDetails) {
    const grossAmount = youtubeAppearanceFeeTotals(details).feeAmount;
    const patch: Partial<CourseCostInput> = {
      categoryCode: "YOUTUBE_FIXED",
      name: "유튜브 출연료",
      managerName: "시스템노바",
      grossAmount,
      calculationDetails: details,
    };
    if (youtubeAppearanceFeeTargetKey) {
      updateDraft(youtubeAppearanceFeeTargetKey, patch);
    } else {
      const key = crypto.randomUUID();
      setDrafts((current) => [...current, {
        key,
        id: null,
        value: { ...emptyInput("COMPANY", "YOUTUBE_FIXED", "유튜브 출연료"), ...patch },
        attachments: [],
      }]);
      setDirtyKeys((current) => new Set(current).add(key));
      setNotice("");
    }
    setYoutubeAppearanceFeeOpen(false);
  }

  function updateDraft(key: string, patch: Partial<CourseCostInput>) {
    setDrafts((current) => current.map((draft) => draft.key === key ? { ...draft, value: { ...draft.value, ...patch } } : draft));
    setDirtyKeys((current) => new Set(current).add(key));
    setNotice("");
  }

  function removeDraft(draft: CostDraft) {
    setDrafts((current) => current.filter((item) => item.key !== draft.key));
    setDirtyKeys((current) => {
      const next = new Set(current);
      next.delete(draft.key);
      return next;
    });
    if (draft.id && draft.value.version) {
      setDeleted((current) => current.some((item) => item.id === draft.id)
        ? current
        : [...current, { id: draft.id!, version: draft.value.version! }]);
    }
    setNotice("");
  }

  function setSectionPaid(burdenType: FixedBurden) {
    const keys = drafts.filter((draft) => belongsToSection(draft.value, burdenType)).map((draft) => draft.key);
    setDrafts((current) => current.map((draft) => belongsToSection(draft.value, burdenType)
      ? { ...draft, value: { ...draft.value, status: "PAID" } }
      : draft));
    setDirtyKeys((current) => {
      const next = new Set(current);
      keys.forEach((key) => next.add(key));
      return next;
    });
    setNotice("");
  }

  function setSectionDateToday(burdenType: FixedBurden) {
    const paidDate = todayInSeoul();
    const keys = drafts.filter((draft) => belongsToSection(draft.value, burdenType) && draft.value.status === "PAID").map((draft) => draft.key);
    setDrafts((current) => current.map((draft) => belongsToSection(draft.value, burdenType) && draft.value.status === "PAID"
      ? { ...draft, value: { ...draft.value, paidDate } }
      : draft));
    setDirtyKeys((current) => {
      const next = new Set(current);
      keys.forEach((key) => next.add(key));
      return next;
    });
    setNotice("");
  }

  function resetAllInputs() {
    if (!changeCount || !window.confirm("저장하지 않은 모든 비용 변경사항을 초기화할까요?")) return;
    setDrafts(draftsFromCosts(costs));
    setDeleted([]);
    setDirtyKeys(new Set());
    setError("");
    setNotice("");
  }

  async function saveChanges() {
    if (!changeCount || !window.confirm("비용을 저장하면 이 강의의 기존 정산 결과와 확정 내역이 모두 삭제됩니다. 원본 엑셀과 증빙은 유지됩니다. 저장할까요?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = await request(`/api/course-operations/${courseId}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creates: drafts.filter((draft) => !draft.id).map((draft) => draft.value),
          updates: drafts.filter((draft) => draft.id && dirtyKeys.has(draft.key)).map((draft) => ({ id: draft.id, version: draft.value.version, input: draft.value })),
          deletes: deleted,
        }),
      });
      resetFromServer(body, `비용 ${body.costs.length}건을 저장했습니다. 기존 정산 결과를 초기화했습니다. 정산 탭에서 엑셀을 다시 검증·저장해 주세요.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "비용 변경사항을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed"><Loader2 className="mr-2 animate-spin"/>비용을 불러오는 중입니다.</div>;

  return <div className="space-y-6">
    {locked ? <Alert><AlertTriangle/><AlertTitle>정산 확정됨</AlertTitle><AlertDescription>비용 변경사항을 저장하면 기존 정산 결과와 확정 내역이 삭제됩니다. 증빙은 추가할 수 있으며, 삭제는 정산 확정 취소 후 가능합니다.</AlertDescription></Alert> : null}
    {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {notice ? <Alert><AlertTitle>저장 완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
    <div className="flex flex-wrap items-center justify-end gap-3">
      {changeCount ? <span className="text-sm text-muted-foreground">저장하지 않은 변경 {changeCount}건</span> : null}
      <Button type="button" variant="outline" disabled={busy || changeCount === 0} onClick={resetAllInputs}><RotateCcw/>전체 입력 내용 초기화</Button>
      <Button type="button" disabled={busy || changeCount === 0} onClick={() => void saveChanges()}>{busy ? <Loader2 className="animate-spin"/> : <Save/>}비용 변경사항 저장</Button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {[["총비용",summary.total],["강사 부담 합계",summary.instructor],["회사 부담 합계",summary.company],["공급가액 합계",summary.supply],["부가세 합계",summary.vat]].map(([label,value]) => <Card key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{money(Number(value))}</p></CardContent></Card>)}
    </div>
    {BURDENS.map((burden) => {
      const items = drafts.filter((draft) => belongsToSection(draft.value, burden.value));
      const hasPaidItem = items.some((draft) => draft.value.status === "PAID");
      return <Card key={burden.value}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{burden.label}</CardTitle><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy || items.length === 0} onClick={() => setSectionPaid(burden.value)}><CheckCircle2/>전체 지급완료</Button><Button type="button" variant="outline" disabled={busy || !hasPaidItem} onClick={() => setSectionDateToday(burden.value)}><CalendarDays/>정산일 오늘로</Button><Button type="button" variant="outline" disabled={busy} onClick={() => addDraft(burden.value)}><Plus/>기타 비용 추가</Button></div></div>
          <div className="flex flex-wrap gap-2">{COURSE_COST_DEFAULT_CATEGORIES[burden.value].map(([code,name]) => <Button type="button" key={code} size="sm" variant="secondary" disabled={busy} onClick={() => code === "YOUTUBE_RS" ? openYoutubeRsDialog() : code === "YOUTUBE_FIXED" ? openYoutubeAppearanceFeeDialog() : addDraft(burden.value, code, name)}>{name} 등록</Button>)}</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`${COST_ROW_GRID} hidden border-b px-3 pb-2 text-xs font-medium text-muted-foreground xl:grid`}><span>이름</span><span>담당자</span><span>정산금액</span><span>비용상태</span><span>정산일</span><span className="sr-only">관리</span></div>
          {items.map((draft) => <CostEditor key={draft.key} draft={draft} locked={locked} busy={busy} courseId={courseId} onChange={(patch) => updateDraft(draft.key, patch)} onDelete={() => removeDraft(draft)} onEditCalculation={() => draft.value.calculationDetails?.kind === "YOUTUBE_RS" ? openYoutubeRsDialog(draft) : openYoutubeAppearanceFeeDialog(draft)} onBusy={setBusy} onError={setError} onApply={applyAttachmentResponse}/>)}
          {!items.length ? <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">등록된 비용이 없습니다.</p> : null}
        </CardContent>
      </Card>;
    })}
    <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-6">
      {changeCount ? <span className="text-sm text-muted-foreground">저장하지 않은 변경 {changeCount}건</span> : null}
      <Button type="button" size="lg" disabled={busy || changeCount === 0} onClick={() => void saveChanges()}>{busy ? <Loader2 className="animate-spin"/> : <Save/>}비용 변경사항 저장</Button>
    </div>
    {youtubeRsOpen ? <YoutubeRsCostDialog courseId={courseId} open initialDetails={youtubeRsInitialDetails} onOpenChange={setYoutubeRsOpen} onConfirm={applyYoutubeRs}/> : null}
    {youtubeAppearanceFeeOpen ? <YoutubeAppearanceFeeDialog courseId={courseId} open initialDetails={youtubeAppearanceFeeInitialDetails} onOpenChange={setYoutubeAppearanceFeeOpen} onConfirm={applyYoutubeAppearanceFee}/> : null}
  </div>;
}

function CostEditor({ draft, locked, busy, courseId, onChange, onDelete, onEditCalculation, onBusy, onError, onApply }: {
  draft: CostDraft;
  locked: boolean;
  busy: boolean;
  courseId: string;
  onChange: (patch: Partial<CourseCostInput>) => void;
  onDelete: () => void;
  onEditCalculation: () => void;
  onBusy: (value: boolean) => void;
  onError: (value: string) => void;
  onApply: (body: CostResponse, message: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");

  function addFiles(files: File[]) {
    try {
      files.forEach(validateAttachment);
      setPendingFiles((current) => [...current, ...files]);
      setAttachmentError("");
    } catch (reason) {
      setAttachmentError(reason instanceof Error ? reason.message : "첨부파일을 확인해 주세요.");
    }
  }

  function closeAttachmentDialog() {
    if (busy) return;
    setAttachmentOpen(false);
    setPendingFiles([]);
    setAttachmentError("");
  }

  async function upload() {
    if (!draft.id || !pendingFiles.length) return;
    onBusy(true);
    onError("");
    setAttachmentError("");
    try {
      const form = new FormData();
      pendingFiles.forEach((file) => form.append("files", file));
      onApply(await request(`/api/course-operations/${courseId}/costs/${draft.id}/attachments`, { method: "POST", body: form }), "증빙을 첨부했습니다.");
      setPendingFiles([]);
      setAttachmentOpen(false);
    } catch (reason) {
      setAttachmentError(reason instanceof Error ? reason.message : "증빙 첨부에 실패했습니다.");
    } finally {
      onBusy(false);
    }
  }

  const actions = <div className="flex h-10 items-center justify-start gap-2 pl-4">
    <Button
      type="button"
      size="icon"
      variant="outline"
      title={draft.id ? (locked ? "확정된 정산서에 증빙 추가" : "증빙 첨부") : "비용을 먼저 저장한 후 증빙을 첨부할 수 있습니다."}
      aria-label="증빙 첨부"
      className="relative size-10 shrink-0 border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
      disabled={busy}
      onClick={() => {
        if (!draft.id) {
          onError("비용을 먼저 저장한 후 증빙을 첨부해 주세요.");
          return;
        }
        setAttachmentOpen(true);
      }}
    >
      <Paperclip className="size-4"/>{draft.attachments.length ? <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">{draft.attachments.length}</span> : null}
    </Button>
    <Button type="button" size="icon" variant="outline" className="size-10 shrink-0 border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300" title="비용 삭제" aria-label={`${draft.value.name || "새 비용"} 삭제`} disabled={busy} onClick={onDelete}><Trash2/></Button>
    {draft.value.calculationDetails ? <Button type="button" size="icon" variant="outline" className="size-10 shrink-0" title={`${draft.value.name} 상세 내역 보기 및 수정`} aria-label={`${draft.value.name} 상세 내역 보기 및 수정`} disabled={busy} onClick={onEditCalculation}><PencilLine/></Button> : null}
  </div>;

  return <>
    <div>
      <CompactCostFields value={draft.value} showLabels={false} actions={actions} onChange={onChange} calculationLocked={Boolean(draft.value.calculationDetails)}/>
      {draft.attachments.length ? <div className="mt-2 flex flex-wrap items-center gap-2">{draft.attachments.map((file) => <span key={file.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"><Paperclip className="size-3"/>{file.url ? <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{file.originalName}<ExternalLink className="size-3"/></a> : file.originalName}<button type="button" disabled={locked || busy} title={locked ? "정산 확정 취소 후 삭제할 수 있습니다." : "증빙 삭제"} aria-label={`${file.originalName} 삭제`} onClick={() => void request(`/api/course-operations/${courseId}/costs/${draft.id}/attachments/${file.id}`, { method: "DELETE" }).then((body) => onApply(body, "증빙을 삭제했습니다."), (reason: unknown) => onError(reason instanceof Error ? reason.message : "증빙을 삭제하지 못했습니다."))}>×</button></span>)}</div> : null}
    </div>
    <Dialog open={attachmentOpen} onOpenChange={(open) => { if (open) setAttachmentOpen(true); else closeAttachmentDialog(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"
        onPaste={(event) => {
          if (busy) return;
          const images = Array.from(event.clipboardData.items)
            .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file))
            .map((file, index) => new File([file], clipboardImageName(file.type, index), { type: file.type, lastModified: Date.now() }));
          event.preventDefault();
          if (!images.length) {
            setAttachmentError("클립보드에서 붙여넣을 사진을 찾지 못했습니다.");
            return;
          }
          addFiles(images);
        }}
      >
        <DialogHeader><DialogTitle>비용 증빙 첨부</DialogTitle></DialogHeader>
        <div
          tabIndex={0}
          className="rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 text-center outline-none transition-colors focus:border-primary focus:bg-primary/5"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
        >
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border"><ClipboardPaste className="size-5 text-primary"/></div>
          <p className="font-medium">사진을 Ctrl+V로 붙여넣으세요</p>
          <p className="mt-1 text-xs text-muted-foreground">이 영역을 클릭해 파일을 직접 선택할 수도 있습니다.</p>
          <Button type="button" variant="outline" className="mt-4" disabled={busy} onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click(); }}><Paperclip/>파일 선택</Button>
          <Input ref={fileInputRef} type="file" multiple className="sr-only" disabled={busy} accept={ATTACHMENT_ACCEPT} onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }}/>
          <p className="mt-3 text-[11px] text-muted-foreground">PDF·JPG·PNG·WEBP·Excel, 파일당 20MB 이하</p>
        </div>
        {pendingFiles.length ? <ul className="space-y-2" aria-label="첨부 대기 파일">
          {pendingFiles.map((file, index) => <li key={`${file.name}-${file.size}-${index}`} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <FileImage className="size-4 shrink-0 text-muted-foreground"/>
            <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{Math.max(1, Math.ceil(file.size / 1024)).toLocaleString("ko-KR")}KB</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`${file.name} 제외`} disabled={busy} onClick={() => setPendingFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X/></Button>
          </li>)}
        </ul> : null}
        {attachmentError ? <Alert variant="destructive"><AlertTitle>첨부할 수 없습니다</AlertTitle><AlertDescription>{attachmentError}</AlertDescription></Alert> : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={closeAttachmentDialog}>취소</Button>
          <Button type="button" disabled={busy || pendingFiles.length === 0} onClick={() => void upload()}>{busy ? <Loader2 className="animate-spin"/> : <Paperclip/>}{pendingFiles.length ? `${pendingFiles.length}개 파일 첨부` : "파일 첨부"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function CompactCostFields({ value, onChange, actions, showLabels = true, calculationLocked = false }: { value: CourseCostInput; onChange: (patch: Partial<CourseCostInput>) => void; actions?: ReactNode; showLabels?: boolean; calculationLocked?: boolean }) {
  const tax = calculateTax(value.grossAmount, "TAXABLE");
  const burden = calculateBurden(value.grossAmount, value.burdenType, value.companyShareRate);
  const shared = value.burdenType === "SHARED";
  const labelClass = showLabels ? "" : "xl:sr-only";
  return <div className={COST_ROW_GRID}>
    <div className="min-w-0 space-y-1"><Label className={labelClass}>이름 *</Label><Input maxLength={100} readOnly={calculationLocked} value={value.name} onChange={(event) => onChange({ name: event.target.value })}/></div>
    <div className="min-w-0 space-y-1"><Label className={labelClass}>담당자 *</Label><Input maxLength={100} readOnly={calculationLocked} value={value.managerName} onChange={(event) => onChange({ managerName: event.target.value })}/></div>
    <div className="min-w-0 space-y-1"><Label className={labelClass}>정산금액 *</Label><div className="flex gap-1"><Input className="min-w-0 flex-1" inputMode="numeric" readOnly={calculationLocked} value={value.grossAmount ? value.grossAmount.toLocaleString("ko-KR") : ""} onChange={(event) => onChange({ grossAmount: Number(event.target.value.replace(/\D/gu, "")) })}/>{shared ? <div className="relative w-24 shrink-0"><Input aria-label="회사 부담률" type="number" min="0" max="100" className="pr-6" value={value.companyShareRate} onChange={(event) => { const companyShareRate = Number(event.target.value); onChange({ companyShareRate, instructorShareRate: 100 - companyShareRate }); }}/><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span></div> : null}</div><p className="truncate px-1 text-[11px] text-muted-foreground">공급 {money(tax.supplyAmount)} · VAT {money(tax.vatAmount)}{shared ? ` · 회사 ${money(burden.companyShareAmount)} · 강사 ${money(burden.instructorShareAmount)}` : ""}</p></div>
    <div className="min-w-0 space-y-1"><Label className={labelClass}>비용상태 *</Label><Select value={value.status} onValueChange={(status: CourseCostInput["status"]) => onChange({ status, paidDate: status === "PLANNED" ? "" : value.paidDate })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="PLANNED">예정</SelectItem><SelectItem value="PAID">지급완료</SelectItem><SelectItem value="CANCELED">취소</SelectItem></SelectContent></Select></div>
    <div className="min-w-0 space-y-1 overflow-hidden"><Label className={labelClass}>정산일 {value.status === "PAID" ? "*" : ""}</Label><Input className="max-w-full" type="date" disabled={value.status === "PLANNED"} value={value.status === "PLANNED" ? "" : value.paidDate} onChange={(event) => onChange({ paidDate: event.target.value })}/></div>
    {actions ?? <span aria-hidden="true"/>}
  </div>;
}
