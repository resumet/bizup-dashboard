"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, Check, CheckCircle2, Clock3, History, Loader2, Plus, RotateCcw, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  async function transfer(task: WorkTask, nextAssigneeId: string) {
    if (nextAssigneeId === task.assignee_id) return;
    setBusy(task.id);
    setError("");
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "담당자를 이관하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function toggleHistory(taskId: string) {
    if (events[taskId]) {
      setEvents((current) => {
        const next = { ...current };
        delete next[taskId];
        return next;
      });
      return;
    }
    setBusy(`history-${taskId}`);
    setError("");
    try {
      const history = await readJson<WorkTaskEvent[]>(await fetch(`/api/hr/tasks/${taskId}/events`, { cache: "no-store" }));
      setEvents((current) => ({ ...current, [taskId]: history }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "이력을 불러오지 못했습니다.");
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
        const employeeOpen = employeeTasks.filter((task) => task.status === "open").length;
        const employeeDone = employeeTasks.length - employeeOpen;
        return <Card key={person.id} className="overflow-hidden">
          <CardHeader className="border-b bg-muted/30 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{initials(person.name)}</span>
                <div className="min-w-0"><CardTitle className="truncate text-base">{person.name}{person.id === userId ? <span className="ml-1 text-xs font-normal text-blue-700">나</span> : null}</CardTitle><p className="truncate text-xs text-muted-foreground">{person.email || "이메일 없음"}</p></div>
              </div>
              <div className="flex shrink-0 gap-1.5"><Badge variant={employeeOpen ? "default" : "secondary"}>진행 {employeeOpen}</Badge><Badge variant="outline">완료 {employeeDone}</Badge></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 p-3">
            {employeeTasks.length ? employeeTasks.map((task) => {
              const canChange = isAdmin || task.assignee_id === userId;
              return <div key={task.id} className={`rounded-xl border bg-background p-3 ${task.status === "done" ? "opacity-65" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5"><strong className={`break-words text-sm ${task.status === "done" ? "line-through" : ""}`}>{task.title}</strong>{isCarriedTask(task, today) ? <Badge variant="secondary">이월</Badge> : null}{task.status === "done" ? <Badge className="bg-emerald-600">완료</Badge> : null}</div>
                    {task.description ? <p className="mt-1.5 break-words text-xs leading-5 text-muted-foreground">{task.description}</p> : null}
                    {isCarriedTask(task, today) ? <p className="mt-1.5 text-[11px] text-amber-700">{task.planned_date}에서 이월</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`${task.title} 이력`} onClick={() => void toggleHistory(task.id)} disabled={busy === `history-${task.id}`}>{busy === `history-${task.id}` ? <Loader2 className="animate-spin" /> : <History />}</Button>
                    {canChange ? <Button size="sm" variant={task.status === "done" ? "outline" : "default"} onClick={() => void changeStatus(task)} disabled={busy === task.id}>{task.status === "done" ? "취소" : "완료"}</Button> : null}
                  </div>
                </div>
                {canChange && task.status !== "done" ? <div className="mt-3 flex items-center gap-2 border-t pt-3"><ArrowRightLeft className="size-4 shrink-0 text-muted-foreground" /><Select value={task.assignee_id} onValueChange={(value) => void transfer(task, value)} disabled={busy === task.id}><SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger><SelectContent>{people.map((target) => <SelectItem key={target.id} value={target.id}>{target.name}</SelectItem>)}</SelectContent></Select></div> : null}
                {events[task.id] ? <div className="mt-3 space-y-2 border-t pt-3">{events[task.id].map((event) => <div key={event.id} className="text-[11px] leading-4 text-muted-foreground"><span className="font-medium text-foreground">{historyText(event)}</span> · {peopleById.get(event.actor_id)?.name ?? "사용자"} · {new Date(event.created_at).toLocaleString("ko-KR")}</div>)}</div> : null}
              </div>;
            }) : <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">오늘 업무가 없습니다.</div>}
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
  </div>;
}
