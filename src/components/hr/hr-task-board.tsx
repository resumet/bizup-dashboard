"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, Check, History, Loader2, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { isCarriedTask, taskAppearsOnWorkday } from "@/lib/work-tasks/dates";
import type { WorkTask, WorkTaskEvent, WorkTaskPerson } from "@/lib/work-tasks/types";

type Review = { checked_out_at: string; incomplete_count: number } | null;

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  return body as T;
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
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<Review>(initialReview);
  const [events, setEvents] = useState<Record<string, WorkTaskEvent[]>>({});

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const visibleTasks = tasks.filter((task) => taskAppearsOnWorkday(task, today));
  const openTasks = tasks.filter((task) => task.status === "open" && task.planned_date <= today);
  const carriedCount = openTasks.filter((task) => isCarriedTask(task, today)).length;

  async function createTask() {
    if (!title.trim() || busy) return;
    setBusy("create"); setError("");
    try {
      const task = await readJson<WorkTask>(await fetch("/api/hr/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      }));
      setTasks((current) => [task, ...current]);
      setTitle(""); setDescription(""); setReview(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "업무를 만들지 못했습니다."); }
    finally { setBusy(""); }
  }

  async function changeStatus(task: WorkTask) {
    const status = task.status === "done" ? "open" : "done";
    setBusy(task.id); setError("");
    try {
      const updated = await readJson<WorkTask>(await fetch(`/api/hr/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", status }),
      }));
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item));
      setReview(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "업무 상태를 저장하지 못했습니다."); }
    finally { setBusy(""); }
  }

  async function transfer(task: WorkTask, nextAssigneeId: string) {
    if (nextAssigneeId === task.assignee_id) return;
    setBusy(task.id); setError("");
    try {
      const updated = await readJson<WorkTask>(await fetch(`/api/hr/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer", assigneeId: nextAssigneeId }),
      }));
      setTasks((current) => isAdmin
        ? current.map((item) => item.id === task.id ? updated : item)
        : current.filter((item) => item.id !== task.id));
      setEvents((current) => { const next = { ...current }; delete next[task.id]; return next; });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "담당자를 이관하지 못했습니다."); }
    finally { setBusy(""); }
  }

  async function toggleHistory(taskId: string) {
    if (events[taskId]) { setEvents((current) => { const next = { ...current }; delete next[taskId]; return next; }); return; }
    setBusy(`history-${taskId}`); setError("");
    try {
      const history = await readJson<WorkTaskEvent[]>(await fetch(`/api/hr/tasks/${taskId}/events`, { cache: "no-store" }));
      setEvents((current) => ({ ...current, [taskId]: history }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "이력을 불러오지 못했습니다."); }
    finally { setBusy(""); }
  }

  async function checkout() {
    setBusy("checkout"); setError("");
    try { setReview(await readJson<Review>(await fetch("/api/hr/checkout", { method: "POST" }))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "퇴근 확인을 저장하지 못했습니다."); }
    finally { setBusy(""); }
  }

  return <div className="mx-auto max-w-5xl space-y-6 px-5 py-10">
    <div><Badge variant="outline">{today}</Badge><h1 className="mt-3 text-3xl font-semibold">오늘의 업무</h1><p className="mt-2 text-muted-foreground">미완료 업무는 다음날에도 자동으로 이 목록에 표시됩니다.</p></div>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    <Card><CardHeader><CardTitle>업무 추가</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
      <div className="grid gap-2 md:col-span-2"><Label htmlFor="task-title">업무</Label><Input id="task-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="오늘 할 업무를 입력하세요" /></div>
      <div className="grid gap-2 md:col-span-2"><Label htmlFor="task-description">설명</Label><Textarea id="task-description" value={description} maxLength={5000} onChange={(event) => setDescription(event.target.value)} placeholder="필요한 세부 내용을 입력하세요" /></div>
      <div className="grid gap-2 md:col-span-2"><Label>최초 담당자</Label><div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">{peopleById.get(userId)?.name ?? "현재 사용자"}</div></div>
      <div className="md:col-span-2 flex justify-end"><Button onClick={() => void createTask()} disabled={!title.trim() || busy === "create"}>{busy === "create" ? <Loader2 className="animate-spin" /> : <Plus />}업무 추가</Button></div>
    </CardContent></Card>

    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">업무 목록</h2><p className="text-sm text-muted-foreground">미완료 {openTasks.length}건 · 전날에서 이월 {carriedCount}건</p></div><Button onClick={() => void checkout()} disabled={busy === "checkout"}>{busy === "checkout" ? <Loader2 className="animate-spin" /> : <Check />}퇴근 전 업무 확인</Button></div>
    {review ? <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">퇴근 확인 완료 · 미완료 업무 {review.incomplete_count}건은 다음 업무일에 자동 표시됩니다.</p> : null}
    <div className="space-y-3">{visibleTasks.length ? visibleTasks.map((task) => {
      const assignee = peopleById.get(task.assignee_id);
      const canChange = isAdmin || task.assignee_id === userId;
      return <Card key={task.id} className={task.status === "done" ? "opacity-70" : ""}><CardContent className="space-y-3 p-4">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><div className="flex flex-wrap items-center gap-2"><strong className={task.status === "done" ? "line-through" : ""}>{task.title}</strong>{task.planned_date < today && task.status === "open" ? <Badge variant="secondary">이월</Badge> : null}{task.status === "done" ? <Badge>완료</Badge> : null}</div>{task.description ? <p className="mt-1 text-sm text-muted-foreground">{task.description}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{task.planned_date} · 담당 {assignee?.name ?? task.assignee_id}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void toggleHistory(task.id)}><History />이력</Button>{canChange ? <Button size="sm" variant={task.status === "done" ? "outline" : "default"} onClick={() => void changeStatus(task)} disabled={busy === task.id}>{task.status === "done" ? "완료 취소" : "완료"}</Button> : null}</div></div>
        {canChange && task.status !== "done" ? <div className="flex items-center gap-2 border-t pt-3"><ArrowRightLeft className="size-4 text-muted-foreground" /><span className="text-sm">담당자 이관</span><Select value={task.assignee_id} onValueChange={(value) => void transfer(task, value)} disabled={busy === task.id}><SelectTrigger className="max-w-64"><SelectValue /></SelectTrigger><SelectContent>{people.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}</SelectContent></Select></div> : null}
        {events[task.id] ? <div className="space-y-2 border-t pt-3">{events[task.id].map((event) => <div key={event.id} className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("ko-KR")} · {peopleById.get(event.actor_id)?.name ?? "사용자"} · {event.event_type === "transferred" ? `${peopleById.get(event.from_assignee_id ?? "")?.name ?? "이전 담당자"} → ${peopleById.get(event.to_assignee_id ?? "")?.name ?? "새 담당자"}` : event.event_type}</div>)}</div> : null}
      </CardContent></Card>;
    }) : <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">오늘 등록된 업무가 없습니다.</CardContent></Card>}</div>
  </div>;
}
