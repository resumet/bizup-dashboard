"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UNIT_LABELS, monthRange, type Leave, type LeavePreview } from "@/lib/hr/types";
import { ErrorNotice, Field, Pager, Panel, PersonSelect, selectClass, useHr, useHrList, useHrMutation, useHrQuery } from "./shared";

function LeaveForm({ leave, employee, saved }: { leave?: Leave; employee?: string; saved: () => void }) {
  const { me, today } = useHr(); const mutation = useHrMutation();
  const [target, setTarget] = useState(leave?.employee_id ?? employee ?? me.id); const [start, setStart] = useState(leave?.start_date ?? today); const [end, setEnd] = useState(leave?.end_date ?? today); const [unit, setUnit] = useState(leave?.unit ?? "full");
  const preview = useHrQuery<LeavePreview>("leave.preview", { start_date: start, end_date: unit === "full" ? end : start, unit });
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const fields = { start_date: start, end_date: unit === "full" ? end : start, unit, private_reason: String(data.get("reason") ?? ""), admin_reason: String(data.get("admin_reason") ?? "") };
    try { await mutation.mutate(leave ? "leave.update" : "leave.create", leave ? { ...fields, id: leave.id, expected_version: leave.version } : { ...fields, employee_id: target }); saved(); } catch {}
  }}>
    {me.role === "admin" && !leave && <Field label="휴가 대상 직원"><PersonSelect value={target} onChange={setTarget} /></Field>}
    <div className="grid gap-4 sm:grid-cols-2"><Field label="시작일"><Input type="date" value={start} min={me.role === "admin" ? undefined : today} required onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} /></Field><Field label="종료일"><Input type="date" value={unit === "full" ? end : start} min={start} required disabled={unit !== "full"} onChange={e => setEnd(e.target.value)} /></Field></div>
    <Field label="사용 단위"><select value={unit} onChange={e => setUnit(e.target.value)} className={selectClass}>{Object.entries(UNIT_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    <Field label="휴가 사유 (본인·관리자만 조회)"><Textarea name="reason" maxLength={2000} defaultValue={leave?.private_reason} /></Field>
    {me.role === "admin" && <Field label="관리자 처리 사유 (대리·과거 처리 시 필수)"><Textarea name="admin_reason" required={target !== me.id || start < today} maxLength={2000} /></Field>}
    <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">적용 미리보기 · {preview.data?.units ?? 0}일</p><p className="mt-2 break-words">{preview.data?.days.map(day => `${day.day} ${UNIT_LABELS[day.segment]}`).join(", ") || "적용 날짜 없음"}</p><p className="mt-2 text-muted-foreground">제외된 휴무일: {preview.data?.excluded.join(", ") || "없음"}</p></div>
    <ErrorNotice error={preview.error} /><ErrorNotice error={mutation.error} /><Button disabled={mutation.busy || Boolean(preview.error) || !preview.data?.units}>{mutation.busy ? "저장 중…" : "휴가 저장"}</Button>
  </form>;
}
function CancelLeave({ leave, saved }: { leave: Leave; saved: () => void }) {
  const { me } = useHr(); const mutation = useHrMutation();
  return <form className="space-y-4" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await mutation.mutate("leave.cancel", { id: leave.id, expected_version: leave.version, reason: String(form.get("reason")), admin_reason: String(form.get("admin_reason") ?? "") }); saved(); } catch {} }}>
    <p className="text-sm">{leave.start_date} ~ {leave.end_date} {UNIT_LABELS[leave.unit]} 휴가를 취소합니다.</p><Field label="취소 사유"><Textarea name="reason" required maxLength={2000} /></Field>{me.role === "admin" && <Field label="관리자 처리 사유"><Textarea name="admin_reason" required maxLength={2000} /></Field>}<ErrorNotice error={mutation.error} /><Button disabled={mutation.busy}>휴가 취소</Button>
  </form>;
}
type CalendarDay = { id: string; leave_id: string; employee_id: string; day: string; segment: string; name: string; department: string; private_reason?: string };
export function LeavesPage({ admin = false }: { admin?: boolean }) {
  const { today, me } = useHr(); const [month, setMonth] = useState(today.slice(0, 7)); const [person, setPerson] = useState(me.id); const [page, setPage] = useState(0); const [mode, setMode] = useState<"create" | "edit" | "cancel" | null>(null); const [selected, setSelected] = useState<Leave>();
  const range = monthRange(month); const leaves = useHrQuery<{ items: Leave[]; total: number; used: number; planned: number }>("leaves", { ...range, employee_id: person, page });
  const calendar = useHrList<CalendarDay>("calendar", range);
  const close = () => { setMode(null); leaves.reload(); calendar.reload(); };
  const firstWeekday = new Date(`${range.from}T00:00:00Z`).getUTCDay(); const lastDay = Number(range.to.slice(-2));
  return <><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">{admin ? "조직 휴가" : "휴가"}</h1><Button onClick={() => { setSelected(undefined); setMode("create"); }}>휴가 등록</Button></div>
    <div className="flex flex-wrap gap-4"><Field label="조회 월"><Input type="month" value={month} required onChange={e => { if (e.target.value) { setMonth(e.target.value); setPage(0); } }} /></Field>{admin && <Field label="직원"><PersonSelect value={person} onChange={value => { setPerson(value); setPage(0); }} /></Field>}</div>
    <div className="grid gap-4 sm:grid-cols-2"><Panel title="사용량"><p className="text-2xl font-semibold">{leaves.data?.used ?? 0}일</p><p className="mt-2 text-xs text-muted-foreground">선택 기간 중 오늘까지 등록된 휴가</p></Panel><Panel title="예정량"><p className="text-2xl font-semibold">{leaves.data?.planned ?? 0}일</p><p className="mt-2 text-xs text-muted-foreground">선택 기간 중 미래 등록 휴가 · 잔여 연차 계산 제외</p></Panel></div>
    <Panel title="조직 휴가 캘린더"><ErrorNotice error={calendar.error} retry={calendar.reload} /><div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-slate-200 text-xs">{["일", "월", "화", "수", "목", "금", "토"].map(day => <div key={day} className="bg-slate-50 p-2 text-center font-medium">{day}</div>)}{Array.from({ length: firstWeekday }, (_,i) => <div key={`blank-${i}`} className="bg-white" />)}{Array.from({ length: lastDay }, (_,i) => { const date = `${month}-${String(i + 1).padStart(2,"0")}`; return <div key={date} className={`min-h-24 min-w-0 bg-white p-1 sm:p-2 ${date === today ? "ring-2 ring-inset ring-emerald-600" : ""}`}><p className="font-medium">{i + 1}</p>{calendar.items?.filter(item => item.day === date).map(item => <p key={item.id} title={`${item.name} · ${item.department} · ${UNIT_LABELS[item.segment]}${item.private_reason ? ` · ${item.private_reason}` : ""}`} className="mt-1 break-words rounded bg-emerald-50 p-1 text-[10px] text-emerald-900 sm:text-xs">{item.name}<span className="block">{UNIT_LABELS[item.segment]}</span></p>)}</div>; })}</div></Panel>
    <Panel title={admin ? "직원 휴가 상세" : "내 휴가"}><ErrorNotice error={leaves.error} retry={leaves.reload} /><div className="divide-y">{leaves.data?.items.map(leave => <article className="flex flex-wrap items-center justify-between gap-3 py-4" key={leave.id}><div><p className="font-medium">{leave.start_date} ~ {leave.end_date} · {UNIT_LABELS[leave.unit]}</p><p className="mt-1 text-sm text-muted-foreground">{leave.status === "cancelled" ? `취소 · ${leave.cancellation_reason}` : "등록"} · {leave.private_reason || "사유 없음"}</p></div>{leave.status !== "cancelled" && <div className="flex gap-2"><Button variant="outline" onClick={() => { setSelected(leave); setMode("edit"); }}>수정</Button><Button variant="outline" onClick={() => { setSelected(leave); setMode("cancel"); }}>취소</Button></div>}</article>)}{!leaves.data?.items.length && <p className="py-5 text-sm text-muted-foreground">이 기간에 등록한 휴가가 없습니다.</p>}</div><Pager page={page} total={leaves.data?.total ?? 0} onPage={setPage} /></Panel>
    <Dialog open={mode !== null} onOpenChange={open => { if (!open) setMode(null); }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{mode === "cancel" ? "휴가 취소" : mode === "edit" ? "휴가 수정" : "휴가 등록"}</DialogTitle><DialogDescription>저장하면 일정과 사용량에 반영되고 관리자에게 알림이 전달됩니다.</DialogDescription></DialogHeader>{mode === "cancel" && selected ? <CancelLeave leave={selected} saved={close} /> : mode && <LeaveForm leave={mode === "edit" ? selected : undefined} employee={person} saved={close} />}</DialogContent></Dialog>
  </>;
}
