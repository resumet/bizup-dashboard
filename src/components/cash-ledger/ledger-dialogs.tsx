"use client";

import { useRef, useState, type FormEvent } from "react";
import { Paperclip, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { attachmentType, entrySchema, formatMoney, ledgerCourseLabel, moneyInput, type Entry, type LedgerState, type Party, type Settings } from "@/lib/cash-ledger/model";
import { normalizePartyName, type ReceiptAnalysis } from "@/lib/cash-ledger/receipt";
import { ReceiptPaste } from "./receipt-paste";

export const fieldClass = "h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm";
export const labelClass = "grid min-w-0 gap-2 text-sm font-medium";
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export async function ledgerRequest(path = "", method = "GET", value?: unknown) {
  const response = await fetch(`/api/cash-ledger${path}`, { method, cache: "no-store", ...(value instanceof FormData ? { body: value } : value === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "요청을 처리하지 못했습니다. 다시 시도해 주세요.");
  return body;
}
export function ErrorMessage({ message }: { message: string }) { return message ? <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null; }

export function OpeningDialog({ settings, onClose, onSaved }: { settings: Settings | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [date, setDate] = useState(settings?.startDate ?? today());
  const [amount, setAmount] = useState(formatMoney(settings?.openingBalance ?? 0));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  async function save(event: FormEvent) {
    event.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setError("");
    try { await ledgerRequest("/settings", "PUT", { startDate: date, openingBalance: Number(amount.replaceAll(",", "")), version: settings?.version ?? null }); await onSaved(); onClose(); }
    catch (failure) { setError((failure as Error).message); } finally { pending.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent aria-describedby={undefined} className="sm:max-w-md" showCloseButton={!busy}>
    <DialogHeader><DialogTitle>시작 잔고 {settings ? "수정" : "등록"}</DialogTitle></DialogHeader>
    <form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
      <label className={labelClass}>기록 시작일<Input type="date" required min="2000-01-01" max="2100-12-31" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className={labelClass}>은행 잔고 (원)<Input inputMode="numeric" required value={amount} onChange={e => setAmount(moneyInput(e.target.value, true))} /><span className="text-xs font-normal text-muted-foreground">시작일의 첫 거래를 기록하기 전 잔고를 입력하세요. 수정하면 전체 잔액을 다시 계산합니다.</span></label>
    </fieldset><ErrorMessage message={error} /><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>취소</Button><Button disabled={busy}>{busy ? "저장 중…" : "시작 잔고 저장"}</Button></DialogFooter></form>
  </DialogContent></Dialog>;
}

const emptyParty = { name: "", bankName: "", accountNumber: "", accountHolder: "", note: "" };
const NEW_RECEIPT_PARTY = "new-receipt-party";
export function PartiesDialog({ parties, onClose, onSaved }: { parties: Party[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState<Party | null>(null);
  const [draft, setDraft] = useState(emptyParty);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  async function save(event: FormEvent) {
    event.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setError("");
    try { await ledgerRequest(`/parties${editing ? `/${editing.id}` : ""}`, editing ? "PATCH" : "POST", { ...draft, version: editing?.version }); await onSaved(); setEditing(null); setDraft(emptyParty); }
    catch (failure) { setError((failure as Error).message); } finally { pending.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" showCloseButton={!busy}>
    <DialogHeader><DialogTitle>거래처 관리</DialogTitle></DialogHeader>
    <div className="grid gap-6 md:grid-cols-2"><div className="space-y-3"><Input aria-label="거래처 검색" placeholder="거래처 검색" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="max-h-80 divide-y overflow-y-auto rounded-md border">{parties.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => <button type="button" key={p.id} disabled={busy} className={`block w-full p-3 text-left hover:bg-muted ${editing?.id === p.id ? "bg-muted" : ""}`} onClick={() => { setEditing(p); setDraft(p); setError(""); }}><span className="font-medium">{p.name}</span><span className="mt-1 block text-xs text-muted-foreground">{[p.bankName, p.accountNumber, p.accountHolder].filter(Boolean).join(" · ") || "계좌 정보 없음"}</span></button>)}{!parties.length ? <p className="p-5 text-sm text-muted-foreground">등록된 거래처가 없습니다.</p> : null}</div>
      <Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(null); setDraft(emptyParty); setError(""); }}><Plus />새 거래처</Button>
    </div><form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-3">
      <label className={labelClass}>거래처명<Input required maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className={labelClass}>은행명<Input maxLength={100} value={draft.bankName} onChange={e => setDraft({ ...draft, bankName: e.target.value })} /></label>
      <label className={labelClass}>계좌번호<Input maxLength={100} value={draft.accountNumber} onChange={e => setDraft({ ...draft, accountNumber: e.target.value })} /></label>
      <label className={labelClass}>예금주<Input maxLength={120} value={draft.accountHolder} onChange={e => setDraft({ ...draft, accountHolder: e.target.value })} /></label>
      <label className={labelClass}>거래처 비고<Textarea maxLength={2000} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
    </fieldset><ErrorMessage message={error} /><Button disabled={busy}>{busy ? "저장 중…" : editing ? "거래처 수정 저장" : "거래처 등록"}</Button></form></div>
  </DialogContent></Dialog>;
}

export function EntryDialog({ entry, state, onClose, onSaved, onManageParties, openAttachments = false }: { entry: Entry | null; state: LedgerState; openAttachments?: boolean; onClose: () => void; onSaved: () => Promise<void>; onManageParties: () => void }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [identity, setIdentity] = useState(entry ? { id: entry.id, version: entry.version } : null);
  const [draft, setDraft] = useState({ kind: entry?.kind ?? "expense", title: entry?.title ?? "", partyId: entry?.partyId ?? "", courseId: entry?.courseId ?? "", entryDate: entry?.entryDate ?? (today() < state.settings!.startDate ? state.settings!.startDate : today()), note: entry?.note ?? "" });
  const [amount, setAmount] = useState(entry ? formatMoney(entry.amount) : "");
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [newPartyName, setNewPartyName] = useState("");
  const [resolvedParty, setResolvedParty] = useState<Party | null>(null);
  const [attachOpen, setAttachOpen] = useState(openAttachments), [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef(false);
  const locked = busy || analyzing;
  const attachments = state.attachments.filter(a => a.entryId === identity?.id);
  const parties = resolvedParty && !state.parties.some(p => p.id === resolvedParty.id) ? [...state.parties, resolvedParty] : state.parties;
  const party = parties.find(p => p.id === draft.partyId);
  function applyReceipt(analysis: ReceiptAnalysis) {
    const matches = parties.filter(p => normalizePartyName(p.name) === normalizePartyName(analysis.partyName));
    setNewPartyName(matches.length ? "" : analysis.partyName);
    setDraft(current => ({ ...current, kind: analysis.kind, entryDate: analysis.entryDate, partyId: matches.length === 1 ? matches[0].id : matches.length ? "" : NEW_RECEIPT_PARTY }));
    setAmount(formatMoney(analysis.amount));
    setError(matches.length > 1 ? "같은 이름의 거래처가 여러 개 있습니다. 지급대상을 직접 선택해 주세요." : "");
  }
  function addFiles(incoming: File[]) {
    try { for (const file of incoming) attachmentType(file); setFiles(current => [...current, ...incoming]); setError(""); }
    catch (failure) { setError((failure as Error).message); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (pending.current || analyzing) return; pending.current = true; setBusy(true); setError("");
    let saved = false;
    try {
      let partyId = draft.partyId;
      if (partyId === NEW_RECEIPT_PARTY) {
        const validated = entrySchema.omit({ partyId: true }).safeParse({ ...draft, courseId: draft.courseId || null, amount: Number(amount.replaceAll(",", "")) });
        if (!validated.success) throw new Error(validated.error.issues[0]?.message ?? "입력값을 확인해 주세요.");
        if (draft.entryDate < state.settings!.startDate) throw new Error("기록 시작일 이전의 내역은 저장할 수 없습니다.");
        const result = await ledgerRequest("/parties/resolve", "POST", { name: newPartyName });
        const created = result.party as Party;
        partyId = created.id; setResolvedParty(created); setNewPartyName(""); setDraft(current => ({ ...current, partyId: created.id }));
      }
      const response = await ledgerRequest(`/entries${identity ? `/${identity.id}` : ""}`, identity ? "PATCH" : "POST", { ...draft, partyId, requestId, courseId: draft.courseId || null, amount: Number(amount.replaceAll(",", "")), version: identity?.version });
      const updated = response.entry as { id: string; version: number }; setIdentity(updated); saved = true;
      for (const file of files) {
        const body = new FormData(); body.set("file", file);
        await ledgerRequest(`/entries/${updated.id}/attachments`, "POST", body);
        setFiles(current => current.filter(item => item !== file));
      }
      await onSaved(); onClose();
    } catch (failure) {
      if (saved) await onSaved().catch(() => {});
      setError(`${saved ? "입출금 내역은 저장되었습니다. 남은 파일은 다시 저장해 주세요. " : ""}${(failure as Error).message}`);
    } finally { pending.current = false; setBusy(false); }
  }
  async function remove() {
    if (!identity || pending.current) return; pending.current = true; setBusy(true); setError("");
    try { await ledgerRequest(`/entries/${identity.id}`, "DELETE", { version: identity.version }); await onSaved(); onClose(); }
    catch (failure) { setError((failure as Error).message); } finally { pending.current = false; setBusy(false); }
  }
  async function removeAttachment(id: string) {
    if (!identity || pending.current) return; pending.current = true; setBusy(true); setError("");
    try { await ledgerRequest(`/entries/${identity.id}/attachments/${id}`, "DELETE"); await onSaved(); }
    catch (failure) { setError((failure as Error).message); } finally { pending.current = false; setBusy(false); }
  }
  return <><Dialog open onOpenChange={open => { if (!open && !locked) onClose(); }}><DialogContent aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!locked}>
    <DialogHeader><DialogTitle>{identity ? "입출금 내역 수정" : "입출금 내역 등록"}</DialogTitle></DialogHeader>
    <form onSubmit={save} className="space-y-4">
      {!identity ? <ReceiptPaste disabled={busy} onAnalysis={applyReceipt} onBusyChange={setAnalyzing} /> : null}
      <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>구분<select aria-label="구분" className={fieldClass} value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as "expense" | "income" })}><option value="expense">지출 (−)</option><option value="income">입금 (+)</option></select></label>
      <label className={labelClass}>날짜<Input type="date" required min={state.settings!.startDate} max="2100-12-31" value={draft.entryDate} onChange={e => setDraft({ ...draft, entryDate: e.target.value })} />{draft.entryDate && draft.entryDate < state.settings!.startDate ? <span className="text-xs font-normal text-destructive">기록 시작일({state.settings!.startDate}) 이전입니다. 날짜 또는 시작 잔고의 기록 시작일을 확인해 주세요.</span> : null}</label>
      <label className={`${labelClass} sm:col-span-2`}>제목<Input required maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <div className="min-w-0 space-y-2"><label className={labelClass}>지급대상<select aria-label="지급대상" required className={fieldClass} value={draft.partyId} onChange={e => setDraft({ ...draft, partyId: e.target.value })}><option value="">거래처 선택</option>{parties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}{newPartyName || draft.partyId === NEW_RECEIPT_PARTY ? <option value={NEW_RECEIPT_PARTY}>{newPartyName || "이름 미입력"} (새 거래처)</option> : null}</select></label>
        {draft.partyId === NEW_RECEIPT_PARTY ? <label className={labelClass}>새 지급대상 이름<Input required maxLength={120} value={newPartyName} onChange={e => setNewPartyName(e.target.value)} /><span className="text-xs font-normal text-muted-foreground">내역을 저장하면 거래처로 함께 등록됩니다.</span></label> : null}
        {party ? <p className="break-all text-xs text-muted-foreground">{[party.bankName, party.accountNumber, party.accountHolder].filter(Boolean).join(" · ")}</p> : null}
        <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={onManageParties}>거래처 등록·수정</Button>
      </div>
      <label className={labelClass}>관련 강의 (선택)<select aria-label="관련 강의 (선택)" className={fieldClass} value={draft.courseId} onChange={e => setDraft({ ...draft, courseId: e.target.value })}><option value="">선택 안 함</option>{state.courses.map(c => <option key={c.id} value={c.id}>{ledgerCourseLabel(c)}</option>)}</select></label>
      <label className={`${labelClass} sm:col-span-2`}>지급/입금금액 (원)<Input inputMode="numeric" required placeholder="0" value={amount} onChange={e => setAmount(moneyInput(e.target.value))} /></label>
      <label className={`${labelClass} sm:col-span-2`}>비고<Textarea maxLength={4000} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
      <div className="sm:col-span-2"><Button type="button" variant="outline" onClick={() => setAttachOpen(true)}><Paperclip />파일첨부 ({attachments.length + files.length})</Button></div>
    </fieldset><ErrorMessage message={error} />
      {confirmDelete ? <div role="alert" className="space-y-3 rounded-md border border-destructive/30 p-3"><p className="text-sm">이 내역과 첨부파일을 삭제하고 잔액을 다시 계산합니다.</p><div className="flex gap-2"><Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>삭제 확정</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>돌아가기</Button></div></div> : null}
      <DialogFooter className="sm:justify-between"><div>{identity ? <Button type="button" variant="ghost" disabled={locked} onClick={() => setConfirmDelete(true)}><Trash2 />삭제</Button> : null}</div><div className="flex gap-2"><Button type="button" variant="outline" disabled={locked} onClick={onClose}>취소</Button><Button disabled={locked}>{busy ? "저장 중…" : "내역 저장"}</Button></div></DialogFooter>
    </form>
  </DialogContent></Dialog>
  <Dialog open={attachOpen} onOpenChange={open => { if (!busy) setAttachOpen(open); }}><DialogContent aria-describedby={undefined} className="max-h-[85dvh] overflow-y-auto sm:max-w-xl" onPaste={event => { if (busy) return; const pasted = Array.from(event.clipboardData.files); if (pasted.length) { event.preventDefault(); addFiles(pasted); } }}>
    <DialogHeader><DialogTitle>파일첨부</DialogTitle></DialogHeader>
    <div tabIndex={0} className="rounded-lg border-2 border-dashed p-6 text-center outline-none focus:border-primary"><Paperclip className="mx-auto mb-3 size-6 text-muted-foreground" /><p className="text-sm">캡처한 이미지나 복사한 파일을 Ctrl+V로 붙여넣으세요.</p><p className="mt-2 text-xs text-muted-foreground">이미지·PDF·Excel·CSV, 파일당 4 MB 이하</p><Input className="mt-4" aria-label="첨부파일 선택" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.xlsx,.xls,.csv" disabled={busy} onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} /></div>
    <ul className="space-y-2">{attachments.map(a => <li key={a.id} className="flex items-center gap-2 rounded-md border p-3"><a className="min-w-0 flex-1 break-all text-sm text-primary underline" href={`/api/cash-ledger/entries/${identity!.id}/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">{a.name}</a><Button type="button" variant="ghost" size="icon" aria-label={`${a.name} 삭제`} disabled={busy} onClick={() => void removeAttachment(a.id)}><X /></Button></li>)}{files.map((file, index) => <li key={index} className="flex items-center gap-2 rounded-md border p-3"><span className="min-w-0 flex-1 break-all text-sm">{file.name}<span className="ml-2 text-xs text-muted-foreground">저장 대기</span></span><Button type="button" variant="ghost" size="icon" aria-label={`${file.name} 첨부 취소`} disabled={busy} onClick={() => setFiles(current => current.filter((_, i) => i !== index))}><X /></Button></li>)}</ul>
    <ErrorMessage message={error} /><p className="text-xs text-muted-foreground">새 첨부파일은 ‘내역 저장’을 누르면 함께 저장됩니다.</p><DialogFooter><Button onClick={() => setAttachOpen(false)} disabled={busy}>첨부 확인</Button></DialogFooter>
  </DialogContent></Dialog></>;
}
