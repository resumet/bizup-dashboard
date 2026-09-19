"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, CalendarDays, Check, CheckCircle2, Clock3, EllipsisVertical, History, Inbox, Loader2, Pencil, Plus, RotateCcw, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isCarriedTask, taskAppearsOnWorkday } from "@/lib/work-tasks/dates";
import type { WorkTask, WorkTaskEvent, WorkTaskPerson } from "@/lib/work-tasks/types";

type Review = { checked_out_at: string; incomplete_count: number } | null;

const EVENT_LABELS: Record<WorkTaskEvent["event_type"], string> = {
  created: "업무 생성",
  completed: "완료",
  reopened: "완료 취소",
  transferred: "담당자 이관",
  edited: "업무 수정",
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  return body as T;
}

function initials(name: string) {
  return name.trim().slice(0, 2) || "직원";
}

export function HrTaskBoard({
  initialTasks,
  people,
  userId,
  isAdmin,
  today,
  initialReview,
}: {
  initialTasks: WorkTask[];
  people: WorkTaskPerson[];
  userId: string;
  isAdmin: boolean;
  today: string;
  initialReview: Review;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [transferTaskId, setTransferTaskId] = useState<string | null>(null);
  const [nextAssigneeId, setNextAssigneeId] = useState("");
  const [transferError, setTransferError] = useState("");
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editError, setEditError] = useState("");
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<Review>(initialReview);
  const [events, setEvents] = useState<Record<string, WorkTaskEvent[]>>({});

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const visibleTasks = tasks.filter((task) => taskAppearsOnWorkday(task, today));
  const openTasks = visibleTasks.filter((task) => task.status === "open");
  const carriedCount = openTasks.filter((task) => isCarriedTask(task, today)).length;
  const completedCount = visibleTasks.filter((task) => task.status === "done").length;
  const myOpenCount = openTasks.filter((task) => task.assignee_id === userId).length;
  const transferTask = transferTaskId ? tasks.find((task) => task.id === transferTaskId) ?? null : null;
  const activeTransferTargets = transferTask
    ? people.filter((person) => person.active && person.id !== transferTask.assignee_id)
    : [];
  const editingTask = editTaskId ? tasks.find((task) => task.id === editTaskId) ?? null : null;
  const historyTask = historyTaskId ? tasks.find((task) => task.id === historyTaskId) ?? null : null;

  async function createTask() {
    if (!title.trim() || busy) return;
    setBusy("create");
    setError("");
    try {
      const task = await readJson<WorkTask>(await fetch("/api/hr/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      }));
      setTasks((current) => [task, ...current]);
      setTitle("");
      setDescription("");
      setReview(null);
      setCreateOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "업무를 만들지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function changeStatus(task: WorkTask) {
    const status = task.status === "done" ? "open" : "done";
    setBusy(task.id);
    setError("");
    try {
      const updated = await readJson<WorkTask>(await fetch(`/api/hr/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", status }),
      }));
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
      setReview(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "업무 상태를 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function saveTaskEdits(task: WorkTask) {
    const nextTitle = editTitle.trim();
    const nextDescription = editDescription.trim();
    if (!nextTitle || nextTitle.length > 200 || nextDescription.length > 5000 || busy) return;
    setBusy(task.id);
    setEditError("");
    try {
      const updated = await readJson<WorkTask>(await fetch(`/api/hr/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", title: nextTitle, description: nextDescription }),
      }));
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
      setEvents((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      setEditTaskId(null);
      setEditTitle("");
      setEditDescription("");
    } catch (reason) {
      setEditError(reason instanceof Error ? reason.message : "업무를 수정하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function transfer(task: WorkTask, nextAssigneeId: string) {
    if (nextAssigneeId === task.assignee_id) return;
    setBusy(task.id);
    setTransferError("");
    try {
      const updated = await readJson<WorkTask>(await fetch(`/api/hr/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer", assigneeId: nextAssigneeId }),
      }));
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
      setEvents((current) => {
        const next = { ...current };
        delete next[task.id];
        return next;
      });
      setTransferTaskId(null);
      setNextAssigneeId("");
    } catch (reason) {
      setTransferError(reason instanceof Error ? reason.message : "담당자를 이관하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function openHistory(taskId: string) {
    setHistoryTaskId(taskId);
    setHistoryError("");
    if (events[taskId]) return;
    setBusy(`history-${taskId}`);
    try {
      const history = await readJson<WorkTaskEvent[]>(await fetch(`/api/hr/tasks/${taskId}/events`, { cache: "no-store" }));
      setEvents((current) => ({ ...current, [taskId]: history }));
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : "히스토리를 불러오지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function checkout() {
    setBusy("checkout");
    setError("");
    try {
      setReview(await readJson<Review>(await fetch("/api/hr/checkout", { method: "POST" })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "퇴근 확인을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  function historyText(event: WorkTaskEvent) {
    if (event.event_type !== "transferred") return EVENT_LABELS[event.event_type];
    const from = peopleById.get(event.from_assignee_id ?? "")?.name ?? "이전 담당자";
    const to = peopleById.get(event.to_assignee_id ?? "")?.name ?? "새 담당자";
    return `${from} → ${to}`;
  }

  function openEditDialog(task: WorkTask) {
    setEditTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description);
    setEditError("");
  }

  function renderTask(task: WorkTask) {
    const canChange = isAdmin || task.assignee_id === userId;
    return <div key={task.id} className={`rounded-xl border bg-background p-3 ${task.status === "done" ? "opacity-65" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <Checkbox
            className="mt-0.5 size-5"
            checked={task.status === "done"}
            disabled={!canChange || busy === task.id}
            onCheckedChange={() => void changeStatus(task)}
            aria-label={`${task.title} ${task.status === "done" ? "완료 취소" : "완료"}`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5"><strong className={`break-words text-sm ${task.status === "done" ? "line-through" : ""}`}>{task.title}</strong>{isCarriedTask(task, today) ? <Badge variant="secondary">이월</Badge> : null}{task.status === "done" ? <Badge className="bg-emerald-600">완료</Badge> : null}</div>
            {task.description ? <p className="mt-1.5 break-words text-xs leading-5 text-muted-foreground">{task.description}</p> : null}
            {task.planned_date < today ? <p className="mt-1.5 text-[11px] text-amber-700">{task.planned_date}에서 이월</p> : null}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`${task.title} 업무 메뉴`} disabled={busy === task.id || busy === `history-${task.id}`}>{busy === task.id || busy === `history-${task.id}` ? <Loader2 className="animate-spin" /> : <EllipsisVertical />}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem disabled={!canChange} onSelect={() => openEditDialog(task)}><Pencil />수정</DropdownMenuItem>
            <DropdownMenuItem disabled={!canChange} onSelect={() => void changeStatus(task)}><CheckCircle2 />{task.status === "done" ? "완료 취소" : "완료"}</DropdownMenuItem>
            <DropdownMenuItem disabled={!canChange || task.status === "done" || !people.some((target) => target.active && target.id !== task.assignee_id)} onSelect={() => { setTransferTaskId(task.id); setNextAssigneeId(""); setTransferError(""); }}><ArrowRightLeft />이관</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void openHistory(task.id)}><History />히스토리</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>;
  }

  return <div className="mx-auto max-w-[1600px] space-y-6 px-5 py-8 lg:px-8 lg:py-10">
    <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
      <div>
        <Badge variant="outline">{today}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">팀 업무 대시보드</h1>
        <p className="mt-2 text-muted-foreground">모든 직원의 오늘 업무와 이월 업무를 한눈에 확인합니다.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void checkout()} disabled={busy === "checkout"}>{busy === "checkout" ? <Loader2 className="animate-spin" /> : <Check />}내 업무 퇴근 확인</Button>
        <Button onClick={() => { setError(""); setCreateOpen(true); }}><Plus />새 업무 추가</Button>
      </div>
    </div>

    {error && !createOpen ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {review ? <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">퇴근 확인 완료 · 내 미완료 업무 {review.incomplete_count}건은 다음 업무일에 자동 표시됩니다.</p> : null}

    <section aria-label="오늘 업무 요약" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">전체 직원</p><p className="mt-1 text-2xl font-semibold tabular-nums">{people.length}명</p></div><span className="rounded-xl bg-slate-100 p-3 text-slate-700"><UsersRound className="size-5" /></span></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">진행 중 업무</p><p className="mt-1 text-2xl font-semibold tabular-nums">{openTasks.length}건</p></div><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Clock3 className="size-5" /></span></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">이월 업무</p><p className="mt-1 text-2xl font-semibold tabular-nums">{carriedCount}건</p></div><span className="rounded-xl bg-amber-50 p-3 text-amber-700"><RotateCcw className="size-5" /></span></CardContent></Card>
      <Card><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">오늘 완료</p><p className="mt-1 text-2xl font-semibold tabular-nums">{completedCount}건</p></div><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><CheckCircle2 className="size-5" /></span></CardContent></Card>
    </section>

    <div><h2 className="text-xl font-semibold">직원별 업무</h2><p className="mt-1 text-sm text-muted-foreground">내 미완료 업무 {myOpenCount}건</p></div>

    <section aria-label="직원별 업무 현황" className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {people.map((person) => {
        const employeeTasks = visibleTasks.filter((task) => task.assignee_id === person.id);
        const todayTasks = employeeTasks.filter((task) => task.planned_date === today);
        const carriedTasks = employeeTasks.filter((task) => task.planned_date < today);
        const employeeOpen = employeeTasks.filter((task) => task.status === "open").length;
        const employeeDone = employeeTasks.length - employeeOpen;
        const isCurrentUser = person.id === userId;
        return <Card key={person.id} className={`overflow-hidden ${isCurrentUser ? "border-sky-200 bg-sky-50/70" : ""}`}>
          <CardHeader className={`border-b px-4 py-4 ${isCurrentUser ? "border-sky-200 bg-sky-100/70" : "bg-muted/30"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{initials(person.name)}</span>
                <div className="min-w-0"><CardTitle className="truncate text-base">{person.name}{isCurrentUser ? <span className="ml-1 text-xs font-normal text-blue-700">나</span> : null}</CardTitle></div>
              </div>
              <div className="flex shrink-0 gap-1.5"><Badge variant={employeeOpen ? "default" : "secondary"}>진행 {employeeOpen}</Badge><Badge variant="outline">완료 {employeeDone}</Badge></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 p-3">
            <section className="space-y-2.5">
              <div className="flex items-center justify-between px-1"><h3 className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="size-5 text-blue-700" />오늘 업무</h3><Badge variant="outline">{todayTasks.length}</Badge></div>
              {todayTasks.length ? <div className="space-y-2.5">{todayTasks.map(renderTask)}</div> : <div className="grid min-h-20 place-items-center rounded-xl border border-dashed text-muted-foreground"><Inbox className="size-5" aria-hidden="true" /><span className="sr-only">오늘 업무가 없습니다.</span></div>}
            </section>
            <section className="space-y-2.5 border-t pt-4">
              <div className="flex items-center justify-between px-1"><h3 className="flex items-center gap-2 text-base font-semibold"><RotateCcw className="size-5 text-amber-700" />어제 못해서 넘어온 업무</h3><Badge variant="outline">{carriedTasks.length}</Badge></div>
              {carriedTasks.length ? <div className="space-y-2.5">{carriedTasks.map(renderTask)}</div> : <div className="grid min-h-14 place-items-center text-muted-foreground"><CheckCircle2 className="size-5" aria-hidden="true" /><span className="sr-only">이월 업무가 없습니다.</span></div>}
            </section>
          </CardContent>
        </Card>;
      })}
    </section>

    <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setError(""); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>새 업무 추가</DialogTitle><DialogDescription>오늘 할 업무를 항목별로 등록합니다. 최초 담당자는 생성한 사람으로 지정됩니다.</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void createTask(); }}>
          {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
          <div className="grid gap-2"><Label htmlFor="task-title">업무</Label><Input id="task-title" autoFocus value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="오늘 할 업무를 입력하세요" /></div>
          <div className="grid gap-2"><Label htmlFor="task-description">설명</Label><Textarea id="task-description" value={description} maxLength={5000} onChange={(event) => setDescription(event.target.value)} placeholder="필요한 세부 내용을 입력하세요" rows={5} /></div>
          <div className="grid gap-2"><Label>최초 담당자</Label><div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">{peopleById.get(userId)?.name ?? "현재 사용자"}</div></div>
          <DialogFooter className="mt-1"><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit" disabled={!title.trim() || busy === "create"}>{busy === "create" ? <Loader2 className="animate-spin" /> : <Plus />}업무 추가</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(editingTask)} onOpenChange={(open) => { if (!open) { setEditTaskId(null); setEditTitle(""); setEditDescription(""); setEditError(""); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>업무 수정</DialogTitle><DialogDescription>업무 제목과 설명을 변경합니다. 수정 내용은 히스토리에 기록됩니다.</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (editingTask) void saveTaskEdits(editingTask); }}>
          {editError ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{editError}</p> : null}
          <div className="grid gap-2"><Label htmlFor="edit-task-title">업무</Label><Input id="edit-task-title" autoFocus value={editTitle} maxLength={200} onChange={(event) => setEditTitle(event.target.value)} /></div>
          <div className="grid gap-2"><Label htmlFor="edit-task-description">설명</Label><Textarea id="edit-task-description" value={editDescription} maxLength={5000} onChange={(event) => setEditDescription(event.target.value)} rows={5} /></div>
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit" disabled={!editTitle.trim() || busy === editingTask?.id || (editingTask ? editTitle.trim() === editingTask.title && editDescription.trim() === editingTask.description : true)}>{busy === editingTask?.id ? <Loader2 className="animate-spin" /> : <Pencil />}수정 저장</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(historyTask)} onOpenChange={(open) => { if (!open) { setHistoryTaskId(null); setHistoryError(""); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>업무 히스토리</DialogTitle><DialogDescription className="break-words">{historyTask?.title}</DialogDescription></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {busy === `history-${historyTask?.id}` ? <div className="grid min-h-32 place-items-center text-muted-foreground"><Loader2 className="size-5 animate-spin" /><span className="sr-only">히스토리를 불러오는 중입니다.</span></div> : null}
          {historyError ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{historyError}</p> : null}
          {historyTask && busy !== `history-${historyTask.id}` && !historyError ? <div className="space-y-3">
            {(events[historyTask.id] ?? []).map((event) => <div key={event.id} className="rounded-xl border p-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-full bg-slate-100 p-2 text-slate-700"><History className="size-4" /></span>
                <div className="min-w-0"><p className="text-sm font-medium">{historyText(event)}</p><p className="mt-1 text-xs text-muted-foreground">{peopleById.get(event.actor_id)?.name ?? "사용자"} · {new Date(event.created_at).toLocaleString("ko-KR")}</p></div>
              </div>
            </div>)}
            {!events[historyTask.id]?.length ? <div className="grid min-h-24 place-items-center text-muted-foreground"><History className="size-5" /><span className="sr-only">히스토리가 없습니다.</span></div> : null}
          </div> : null}
        </div>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">닫기</Button></DialogClose></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(transferTask)} onOpenChange={(open) => { if (!open) { setTransferTaskId(null); setNextAssigneeId(""); setTransferError(""); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>담당자 이관</DialogTitle><DialogDescription>{transferTask ? `“${transferTask.title}” 업무를 이관할 활성 사용자를 선택해 주세요.` : "업무를 이관할 사용자를 선택해 주세요."}</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (transferTask && nextAssigneeId) void transfer(transferTask, nextAssigneeId); }}>
          {transferError ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{transferError}</p> : null}
          <div className="grid gap-2"><Label>새 담당자</Label><Select value={nextAssigneeId} onValueChange={setNextAssigneeId}><SelectTrigger><SelectValue placeholder="활성 사용자 선택" /></SelectTrigger><SelectContent>{activeTransferTargets.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select>{!activeTransferTargets.length ? <p className="text-xs text-muted-foreground">이관할 수 있는 활성 사용자가 없습니다.</p> : null}</div>
          <DialogFooter><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit" disabled={!nextAssigneeId || busy === transferTask?.id}>{busy === transferTask?.id ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}이관</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
