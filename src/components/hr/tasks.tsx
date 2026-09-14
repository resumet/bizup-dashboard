"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { STATUS_LABELS, formatTime, type Task, type TaskStatus } from "@/lib/hr/types";
import { ErrorNotice, Field, Pager, Panel, PersonSelect, selectClass, StatusBadge, useHr, useHrMutation, useHrQuery } from "./shared";

export function TaskForm({ task, saved }: { task?: Task; saved: () => void }) {
  const { me, today, directory } = useHr(); const mutation = useHrMutation();
  const [assignee, setAssignee] = useState(task?.assignee_id ?? me.id); const [watchers, setWatchers] = useState<string[]>(task?.watcher_ids ?? []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const fields = { title: String(data.get("title")), description: String(data.get("description")), planned_date: String(data.get("planned_date")), watcher_ids: watchers.filter(id => id !== assignee) };
    try { await mutation.mutate(task ? "task.update" : "task.create", task ? { ...fields, id: task.id, expected_version: task.version } : { ...fields, assignee_id: assignee }); saved(); } catch { /* Retain the form for retry. */ }
  }
  return <form onSubmit={submit} className="space-y-4">
    <Field label="업무 이름"><Input name="title" required maxLength={150} defaultValue={task?.title} placeholder="오늘 진행할 업무를 입력하세요" /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="담당자">{task ? <p className="py-2">{task.assignee_name} · 변경은 업무 이관에서 처리합니다.</p> : <PersonSelect value={assignee} onChange={setAssignee} />}</Field><Field label="업무 예정일"><Input name="planned_date" type="date" required defaultValue={task?.planned_date ?? today} /></Field></div>
    <fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-medium">참조자</legend><div className="flex max-h-40 flex-wrap gap-3 overflow-auto">{directory.filter(person => person.id !== assignee).map(person => <label className="flex min-h-10 items-center gap-2 text-sm" key={person.id}><input type="checkbox" checked={watchers.includes(person.id)} onChange={event => setWatchers(event.target.checked ? [...watchers, person.id] : watchers.filter(id => id !== person.id))} />{person.name}</label>)}</div></fieldset>
    <Field label="상세내용"><Textarea name="description" rows={5} maxLength={10000} defaultValue={task?.description} /></Field>
    <ErrorNotice error={mutation.error} /><Button type="submit" disabled={mutation.busy}>{mutation.busy ? "저장 중…" : task ? "변경 저장" : "업무 추가"}</Button>
  </form>;
}
export function TaskCreateButton({ saved }: { saved: () => void }) {
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)}>업무 추가</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>새 업무</DialogTitle><DialogDescription>예정일을 기준으로 내 업무에 이어서 표시됩니다.</DialogDescription></DialogHeader>{open && <TaskForm saved={() => { setOpen(false); saved(); }} />}</DialogContent></Dialog></>;
}
export function TaskCards({ tasks, statusSaved }: { tasks: Task[]; statusSaved?: () => void }) {
  const { me } = useHr();
  return <div className="divide-y">{tasks.length ? tasks.map(task => <article key={task.id} className="py-3"><Link href={`/hr/tasks/${task.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2 hover:bg-slate-50"><div className="min-w-0"><p className="text-xs text-muted-foreground">{task.task_key} · {task.planned_date}</p><p className="mt-1 break-words font-medium">{task.title}</p><p className="mt-1 text-xs text-muted-foreground">{task.assignee_name} · 참조 {task.watchers?.map(w => w.name).join(", ") || "없음"} · {formatTime(task.updated_at)}</p></div><StatusBadge status={task.status} /></Link>{statusSaved && (me.id === task.assignee_id || me.role === "admin") && <details className="mt-2 rounded-lg border p-3"><summary className="cursor-pointer text-sm text-blue-700">빠른 상태 변경</summary><div className="mt-3"><TaskStatusForm task={task} key={task.version} saved={statusSaved} /></div></details>}</article>) : <p className="py-6 text-sm text-muted-foreground">표시할 업무가 없습니다. 업무를 추가하거나 검색 조건을 바꿔보세요.</p>}</div>;
}
export function TasksPage({ admin = false }: { admin?: boolean }) {
  const [scope, setScope] = useState(admin ? "all" : "assigned"); const [status, setStatus] = useState("open"); const [q, setQ] = useState(""); const [person, setPerson] = useState(""); const [date, setDate] = useState(""); const [page, setPage] = useState(0);
  const data = useHrQuery<{ items: Task[]; total: number }>("tasks", { scope, status, q, assignee_id: person, planned_date: date, page });
  const filter = (update: () => void) => { update(); setPage(0); };
  return <><div className="flex items-center justify-between"><h1 className="text-2xl font-semibold">업무</h1><TaskCreateButton saved={data.reload} /></div>
    <Panel title="업무 목록"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Field label="업무 범위"><select className={selectClass} value={scope} onChange={e => filter(() => setScope(e.target.value))}><option value="assigned">내 담당 업무</option><option value="created">내가 만든 업무</option><option value="watching">참조 업무</option><option value="all">조회 가능한 전체</option></select></Field>
      <Field label="진행상태"><select className={selectClass} value={status} onChange={e => filter(() => setStatus(e.target.value))}><option value="open">미완료</option><option value="all">전체 상태</option>{Object.entries(STATUS_LABELS).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
      <Field label="이름·업무 ID 검색"><Input value={q} onChange={e => filter(() => setQ(e.target.value))} placeholder="업무명 또는 TASK-번호" /></Field>
      <Field label="담당자"><PersonSelect value={person} onChange={value => filter(() => setPerson(value))} allowAll /></Field>
      <Field label="예정일"><Input type="date" value={date} onChange={e => filter(() => setDate(e.target.value))} /></Field>
    </div><ErrorNotice error={data.error} retry={data.reload} />{data.loading ? <p className="py-5" role="status">불러오는 중…</p> : <TaskCards tasks={data.data?.items ?? []} />}<Pager page={page} total={data.data?.total ?? 0} onPage={setPage} /></Panel>
  </>;
}

export function TaskStatusForm({ task, saved }: { task: Task; saved: () => void }) {
  const { me } = useHr(); const mutation = useHrMutation(); const [status, setStatus] = useState<TaskStatus>(task.status);
  if (me.id !== task.assignee_id && me.role !== "admin") return <p className="text-sm text-muted-foreground">상태 변경은 현재 담당자가 처리합니다.</p>;
  const needsReason = status === "cancelled" || ["done", "cancelled"].includes(task.status);
  return <form className="space-y-3" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await mutation.mutate("task.status", { id: task.id, expected_version: task.version, status, reason: String(form.get("reason") ?? "") }); saved(); } catch {} }}>
    <Field label="변경할 상태"><select value={status} onChange={e => setStatus(e.target.value as TaskStatus)} className={selectClass}>{Object.entries(STATUS_LABELS).filter(([value]) => value === task.status || !(["done", "cancelled"].includes(task.status) && ["done", "cancelled"].includes(value))).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
    {needsReason && status !== task.status && <Field label="취소·재개 사유"><Textarea name="reason" maxLength={1000} required /></Field>}
    <ErrorNotice error={mutation.error} /><Button variant="outline" disabled={mutation.busy || status === task.status}>상태 변경</Button>
  </form>;
}
function TransferForm({ task, saved }: { task: Task; saved: () => void }) {
  const { directory } = useHr(); const [target, setTarget] = useState(directory.find(e => e.id !== task.assignee_id)?.id ?? ""); const mutation = useHrMutation();
  return <form className="space-y-4" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); try { await mutation.mutate("task.transfer", { id: task.id, expected_version: task.version, new_assignee_id: target, handover_note: String(form.get("note")) }); saved(); } catch {} }}>
    <p className="text-sm text-muted-foreground">저장하면 새 담당자에게 즉시 이관되고 이전 담당자는 참조자로 추가됩니다.</p><Field label="새 담당자"><PersonSelect value={target} onChange={setTarget} exclude={task.assignee_id} /></Field>
    <Field label="인수인계 메모"><Textarea name="note" required minLength={1} maxLength={2000} rows={4} placeholder="현재 상황, 다음 할 일, 주의사항을 알려주세요." /></Field><ErrorNotice error={mutation.error} /><Button disabled={!target || mutation.busy}>업무 이관</Button>
  </form>;
}
type EventTask = Partial<Task> & { assignee_snapshot?: { name: string }; watcher_snapshots?: { name: string }[] };
type TaskDetail = { task: Task; comments: { id: string; body: string; author_name: string; created_at: string }[]; comments_total: number; events: { id: string; event_type: string; actor_name: string; created_at: string; reason: string; before_data: EventTask | null; after_data: EventTask | null }[]; events_total: number };
function historyValue(data: EventTask | null, key: string) {
  if (!data) return "—";
  if (key === "assignee_id") return data.assignee_snapshot?.name ?? "이전 담당자";
  if (key === "watcher_ids") return data.watcher_snapshots?.map(person => person.name).join(", ") || "없음";
  if (key === "status") return data.status ? STATUS_LABELS[data.status] : "—";
  return String(data[key as keyof Task] ?? "없음");
}
function SafeText({ text }: { text: string }) { return <div className="whitespace-pre-wrap break-words text-sm leading-7">{text.split(/(https?:\/\/[^\s<>]+)/g).map((part,index) => /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noreferrer" className="text-blue-700 underline">{part}</a> : part)}</div>; }
export function TaskDetailPage({ id }: { id: string }) {
  const { me } = useHr(); const [page, setPage] = useState(0); const detail = useHrQuery<TaskDetail>("task", { id, page }); const [mode, setMode] = useState<"edit" | "transfer" | null>(null); const mutation = useHrMutation();
  const task = detail.data?.task;
  if (!task) return <><ErrorNotice error={detail.error} retry={detail.reload} /><Link href="/hr/tasks" className="underline">업무 목록</Link>{detail.loading && <p>업무를 불러오는 중…</p>}</>;
  const canEdit = me.role === "admin" || [task.creator_id, task.assignee_id].includes(me.id); const canTransfer = (me.role === "admin" || me.id === task.assignee_id) && ["ready", "doing"].includes(task.status);
  return <><Link href="/hr/tasks" className="text-sm text-muted-foreground">← 업무 목록</Link><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs text-muted-foreground">{task.task_key}</p><h1 className="mt-2 break-words text-2xl font-semibold">{task.title}</h1></div><div className="flex gap-2">{canEdit && <Button variant="outline" onClick={() => setMode("edit")}>수정</Button>}{canTransfer && <Button onClick={() => setMode("transfer")}>업무 이관</Button>}</div></div><ErrorNotice error={detail.error} retry={detail.reload} />
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]"><Panel title="업무 내용"><p className="mb-4 text-sm text-muted-foreground">담당 {task.assignee_name} · 작성 {task.creator_name} · 예정일 {task.planned_date}</p><p className="mb-4 text-sm">참조: {task.watchers.map(e => e.name).join(", ") || "없음"}</p><SafeText text={task.description || "상세내용이 없습니다."} /></Panel><Panel title="진행상태"><div className="mb-4"><StatusBadge status={task.status} /></div><TaskStatusForm key={task.version} task={task} saved={detail.reload} /></Panel></div>
    <Panel title="댓글"><form className="space-y-3" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const body = String(new FormData(form).get("comment")); try { await mutation.mutate("task.comment", { id, body }); form.reset(); detail.reload(); } catch {} }}><Field label="새 댓글"><Textarea name="comment" required maxLength={10000} /></Field><ErrorNotice error={mutation.error} /><Button disabled={mutation.busy}>댓글 등록</Button></form><div className="mt-5 divide-y">{detail.data?.comments.map(comment => <article className="py-4" key={comment.id}><p className="mb-2 text-xs text-muted-foreground">{comment.author_name} · {formatTime(comment.created_at)}</p><SafeText text={comment.body} /></article>)}</div></Panel>
    <Panel title="변경 이력"><ol className="space-y-4">{detail.data?.events.map(event => <li key={event.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{event.actor_name} · {({ created: "업무 생성", "task.update": "업무 수정", "task.status": "상태 변경", "task.transfer": "업무 이관", comment: "댓글" } as Record<string, string>)[event.event_type] ?? event.event_type}</p><p className="mt-1 text-xs text-muted-foreground">{formatTime(event.created_at)}</p>{event.reason && <p className="mt-2 whitespace-pre-wrap">{event.reason}</p>}{event.before_data && event.after_data && <ul className="mt-2 space-y-1 text-xs">{["title", "description", "assignee_id", "watcher_ids", "status", "planned_date"].filter(key => JSON.stringify(event.before_data?.[key as keyof Task]) !== JSON.stringify(event.after_data?.[key as keyof Task])).map(key => <li key={key}>{({title:"이름",description:"내용",assignee_id:"담당자",watcher_ids:"참조자",status:"상태",planned_date:"예정일"} as Record<string,string>)[key]}: {historyValue(event.before_data, key)} → {historyValue(event.after_data, key)}</li>)}</ul>}</li>)}</ol><Pager page={page} total={Math.max(detail.data?.events_total ?? 0, detail.data?.comments_total ?? 0)} onPage={setPage} /></Panel>
    <Dialog open={mode !== null} onOpenChange={open => { if (!open) setMode(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{mode === "edit" ? "업무 수정" : "업무 이관"}</DialogTitle><DialogDescription>저장 전 변경 내용을 확인해 주세요.</DialogDescription></DialogHeader>{mode === "edit" ? <TaskForm task={task} saved={() => { setMode(null); detail.reload(); }} /> : mode === "transfer" ? <TransferForm task={task} saved={() => { setMode(null); detail.reload(); }} /> : null}</DialogContent></Dialog>
  </>;
}
