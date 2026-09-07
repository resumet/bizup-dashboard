"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, ExternalLink, Loader2, Paperclip, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateBurden, calculateTax } from "@/lib/course-costs/calculation";
import {
  COURSE_COST_DEFAULT_CATEGORIES,
  type CourseCost,
  type CourseCostAttachment,
  type CourseCostBurden,
  type CourseCostInput,
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

function emptyInput(burdenType: FixedBurden, categoryCode = "CUSTOM", name = ""): CourseCostInput {
  return {
    categoryCode, name, burdenType, managerUserId: null, managerName: "", grossAmount: 0,
    taxType: "TAXABLE", paidDate: "", status: "PLANNED", evidenceRequired: false,
    evidenceNeedsReview: false, evidenceTypes: [], otherEvidenceType: "",
    companyShareRate: burdenType === "COMPANY" ? 100 : burdenType === "SHARED" ? 50 : 0,
    instructorShareRate: burdenType === "INSTRUCTOR" ? 100 : burdenType === "SHARED" ? 50 : 0,
    includeInSettlement: true, note: "",
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
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = await request(`/api/course-operations/${courseId}/costs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creates: drafts.filter((draft) => !draft.id).map((draft) => draft.value),
          updates: drafts.filter((draft) => draft.id).map((draft) => ({ id: draft.id, version: draft.value.version, input: draft.value })),
          deletes: deleted,
        }),
      });
      resetFromServer(body, `비용 ${body.costs.length}건을 저장했습니다.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "비용 변경사항을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed"><Loader2 className="mr-2 animate-spin"/>비용을 불러오는 중입니다.</div>;

  return <div className="space-y-6">
    {locked ? <Alert><AlertTriangle/><AlertTitle>정산 확정으로 잠김</AlertTitle><AlertDescription>정산 탭에서 확정을 취소한 후 비용을 변경할 수 있습니다.</AlertDescription></Alert> : null}
    {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {notice ? <Alert><AlertTitle>저장 완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}
    <div className="flex flex-wrap items-center justify-end gap-3">
      {changeCount ? <span className="text-sm text-muted-foreground">저장하지 않은 변경 {changeCount}건</span> : null}
      <Button type="button" variant="outline" disabled={locked || busy || changeCount === 0} onClick={resetAllInputs}><RotateCcw/>전체 입력 내용 초기화</Button>
      <Button type="button" disabled={locked || busy} onClick={() => void saveChanges()}>{busy ? <Loader2 className="animate-spin"/> : <Save/>}비용 변경사항 저장</Button>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {[["총비용",summary.total],["강사 부담 합계",summary.instructor],["회사 부담 합계",summary.company],["공급가액 합계",summary.supply],["부가세 합계",summary.vat]].map(([label,value]) => <Card key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{money(Number(value))}</p></CardContent></Card>)}
    </div>
    {BURDENS.map((burden) => {
      const items = drafts.filter((draft) => belongsToSection(draft.value, burden.value));
      const hasPaidItem = items.some((draft) => draft.value.status === "PAID");
      return <Card key={burden.value}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{burden.label}</CardTitle><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={locked || busy || items.length === 0} onClick={() => setSectionPaid(burden.value)}><CheckCircle2/>전체 지급완료</Button><Button type="button" variant="outline" disabled={locked || busy || !hasPaidItem} onClick={() => setSectionDateToday(burden.value)}><CalendarDays/>정산일 오늘로</Button><Button type="button" variant="outline" disabled={locked || busy} onClick={() => addDraft(burden.value)}><Plus/>기타 비용 추가</Button></div></div>
          <div className="flex flex-wrap gap-2">{COURSE_COST_DEFAULT_CATEGORIES[burden.value].map(([code,name]) => <Button type="button" key={code} size="sm" variant="secondary" disabled={locked || busy} onClick={() => addDraft(burden.value, code, name)}>{name} 등록</Button>)}</div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className={`${COST_ROW_GRID} hidden border-b px-3 pb-2 text-xs font-medium text-muted-foreground xl:grid`}><span>이름</span><span>담당자</span><span>정산금액</span><span>비용상태</span><span>정산일</span><span className="sr-only">관리</span></div>
          {items.map((draft) => <CostEditor key={draft.key} draft={draft} locked={locked} busy={busy} courseId={courseId} onChange={(patch) => updateDraft(draft.key, patch)} onDelete={() => removeDraft(draft)} onBusy={setBusy} onError={setError} onApply={applyAttachmentResponse}/>)}
          {!items.length ? <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">등록된 비용이 없습니다.</p> : null}
        </CardContent>
      </Card>;
    })}
    <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-6">
      {changeCount ? <span className="text-sm text-muted-foreground">저장하지 않은 변경 {changeCount}건</span> : null}
      <Button type="button" size="lg" disabled={locked || busy} onClick={() => void saveChanges()}>{busy ? <Loader2 className="animate-spin"/> : <Save/>}비용 변경사항 저장</Button>
    </div>
  </div>;
}

function CostEditor({ draft, locked, busy, courseId, onChange, onDelete, onBusy, onError, onApply }: {
  draft: CostDraft;
  locked: boolean;
  busy: boolean;
  courseId: string;
  onChange: (patch: Partial<CourseCostInput>) => void;
  onDelete: () => void;
  onBusy: (value: boolean) => void;
  onError: (value: string) => void;
  onApply: (body: CostResponse, message: string) => void;
}) {
  async function upload(files: FileList | null) {
    if (!draft.id || !files?.length) return;
    onBusy(true);
    try {
      const form = new FormData();
      Array.from(files).forEach((file) => form.append("files", file));
      onApply(await request(`/api/course-operations/${courseId}/costs/${draft.id}/attachments`, { method: "POST", body: form }), "증빙을 첨부했습니다.");
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "증빙 첨부에 실패했습니다.");
    } finally {
      onBusy(false);
    }
  }

  const attachmentDisabled = locked || busy || !draft.id;
  const actions = <div className="flex h-10 items-center justify-start gap-2 pl-4">
    <Label title={draft.id ? "증빙 첨부" : "비용을 먼저 저장한 후 증빙을 첨부할 수 있습니다."} aria-label="증빙 첨부" className={`relative inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300 ${attachmentDisabled ? "pointer-events-none cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-blue-100"}`}>
      <Paperclip className="size-4"/>{draft.attachments.length ? <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">{draft.attachments.length}</span> : null}
      <Input type="file" multiple className="sr-only" disabled={attachmentDisabled} accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx" onChange={(event) => { void upload(event.target.files); event.currentTarget.value = ""; }}/>
    </Label>
    <Button type="button" size="icon" variant="outline" className="size-10 shrink-0 border-red-300 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300" title="비용 삭제" aria-label={`${draft.value.name || "새 비용"} 삭제`} disabled={locked || busy} onClick={onDelete}><Trash2/></Button>
  </div>;

  return <div>
    <CompactCostFields value={draft.value} showLabels={false} actions={actions} onChange={onChange}/>
    {draft.attachments.length ? <div className="mt-2 flex flex-wrap items-center gap-2">{draft.attachments.map((file) => <span key={file.id} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"><Paperclip className="size-3"/>{file.url ? <a href={file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{file.originalName}<ExternalLink className="size-3"/></a> : file.originalName}<button type="button" disabled={locked || busy} aria-label={`${file.originalName} 삭제`} onClick={() => void request(`/api/course-operations/${courseId}/costs/${draft.id}/attachments/${file.id}`, { method: "DELETE" }).then((body) => onApply(body, "증빙을 삭제했습니다."), (reason: unknown) => onError(reason instanceof Error ? reason.message : "증빙을 삭제하지 못했습니다."))}>×</button></span>)}</div> : null}
  </div>;
}

function CompactCostFields({ value, onChange, actions, showLabels = true }: { value: CourseCostInput; onChange: (patch: Partial<CourseCostInput>) => void; actions?: ReactNode; showLabels?: boolean }) {
  const tax = calculateTax(value.grossAmount, "TAXABLE");
  const burden = calculateBurden(value.grossAmount, value.burdenType, value.companyShareRate);
  const shared = value.burdenType === "SHARED";
  const labelClass = showLabels ? "" : "xl:sr-only";
  return <div className={COST_ROW_GRID}>
    <div className="min-w-0 space-y-1"><Label className={labelClass}>이름 *</Label><Input maxLength={100} value={value.name} onChange={(event) => onChange({ name: event.target.value })}/></div>
    <div className="min-w-0 space-y-1"><Label className={labelClass}>담당자 *</Label><Input maxLength={100} value={value.managerName} onChange={(event) => onChange({ managerName: event.target.value })}/></div>
    <div className="min-w-0 space-y-1"><Label className={labelClass}>정산금액 *</Label><div className="flex gap-1"><Input className="min-w-0 flex-1" inputMode="numeric" value={value.grossAmount ? value.grossAmount.toLocaleString("ko-KR") : ""} onChange={(event) => onChange({ grossAmount: Number(event.target.value.replace(/\D/gu, "")) })}/>{shared ? <div className="relative w-24 shrink-0"><Input aria-label="회사 부담률" type="number" min="0" max="100" className="pr-6" value={value.companyShareRate} onChange={(event) => { const companyShareRate = Number(event.target.value); onChange({ companyShareRate, instructorShareRate: 100 - companyShareRate }); }}/><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span></div> : null}</div><p className="truncate px-1 text-[11px] text-muted-foreground">공급 {money(tax.supplyAmount)} · VAT {money(tax.vatAmount)}{shared ? ` · 회사 ${money(burden.companyShareAmount)} · 강사 ${money(burden.instructorShareAmount)}` : ""}</p></div>
    <div className="min-w-0 space-y-1"><Label className={labelClass}>비용상태 *</Label><Select value={value.status} onValueChange={(status: CourseCostInput["status"]) => onChange({ status, paidDate: status === "PLANNED" ? "" : value.paidDate })}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="PLANNED">예정</SelectItem><SelectItem value="PAID">지급완료</SelectItem><SelectItem value="CANCELED">취소</SelectItem></SelectContent></Select></div>
    <div className="min-w-0 space-y-1 overflow-hidden"><Label className={labelClass}>정산일 {value.status === "PAID" ? "*" : ""}</Label><Input className="max-w-full" type="date" disabled={value.status === "PLANNED"} value={value.status === "PLANNED" ? "" : value.paidDate} onChange={(event) => onChange({ paidDate: event.target.value })}/></div>
    {actions ?? <span aria-hidden="true"/>}
  </div>;
}
