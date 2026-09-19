"use client";

import Link from "next/link";
import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

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
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  CourseScheduleDraft,
  CourseSchedulePlannerData,
} from "@/lib/course-schedule-planner/types";

const DRAG_TYPE = "application/x-bizup-course-draft";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const COLORS = [
  { card: "border-rose-200 bg-rose-50", event: "border-rose-200 bg-rose-100 text-rose-950", dot: "bg-rose-500" },
  { card: "border-orange-200 bg-orange-50", event: "border-orange-200 bg-orange-100 text-orange-950", dot: "bg-orange-500" },
  { card: "border-amber-200 bg-amber-50", event: "border-amber-200 bg-amber-100 text-amber-950", dot: "bg-amber-500" },
  { card: "border-emerald-200 bg-emerald-50", event: "border-emerald-200 bg-emerald-100 text-emerald-950", dot: "bg-emerald-500" },
  { card: "border-teal-200 bg-teal-50", event: "border-teal-200 bg-teal-100 text-teal-950", dot: "bg-teal-500" },
  { card: "border-sky-200 bg-sky-50", event: "border-sky-200 bg-sky-100 text-sky-950", dot: "bg-sky-500" },
  { card: "border-blue-200 bg-blue-50", event: "border-blue-200 bg-blue-100 text-blue-950", dot: "bg-blue-500" },
  { card: "border-violet-200 bg-violet-50", event: "border-violet-200 bg-violet-100 text-violet-950", dot: "bg-violet-500" },
  { card: "border-fuchsia-200 bg-fuchsia-50", event: "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-950", dot: "bg-fuchsia-500" },
  { card: "border-pink-200 bg-pink-50", event: "border-pink-200 bg-pink-100 text-pink-950", dot: "bg-pink-500" },
] as const;

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function calendarDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  first.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    return dateKey(date);
  });
}

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  return body as T;
}

function initialMonth(data: CourseSchedulePlannerData) {
  const upcoming = [
    ...data.drafts.flatMap((draft) => draft.scheduledDate ? [draft.scheduledDate] : []),
    ...data.confirmedCourses.map((course) => course.webinarDate),
  ].filter((date) => date >= data.today).sort()[0];
  return (upcoming ?? data.today).slice(0, 7);
}

export function CourseSchedulePlanner({ initialData }: { initialData: CourseSchedulePlannerData }) {
  const [drafts, setDrafts] = useState(initialData.drafts);
  const [month, setMonth] = useState(() => initialMonth(initialData));
  const [instructorName, setInstructorName] = useState("");
  const [topic, setTopic] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<CourseScheduleDraft | null>(null);
  const [editInstructor, setEditInstructor] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CourseScheduleDraft | null>(null);

  const days = useMemo(() => calendarDates(month), [month]);
  const draftsByDate = useMemo(() => {
    const map = new Map<string, CourseScheduleDraft[]>();
    for (const draft of drafts) {
      if (!draft.scheduledDate) continue;
      const items = map.get(draft.scheduledDate) ?? [];
      items.push(draft);
      map.set(draft.scheduledDate, items);
    }
    return map;
  }, [drafts]);
  const confirmedByDate = useMemo(() => {
    const map = new Map<string, CourseSchedulePlannerData["confirmedCourses"]>();
    for (const course of initialData.confirmedCourses) {
      const items = map.get(course.webinarDate) ?? [];
      items.push(course);
      map.set(course.webinarDate, items);
    }
    return map;
  }, [initialData.confirmedCourses]);
  const unassignedDrafts = useMemo(
    () => drafts.filter((draft) => !draft.scheduledDate).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [drafts],
  );
  const assignedDrafts = useMemo(
    () => drafts.filter((draft) => draft.scheduledDate).sort((a, b) => (a.scheduledDate ?? "").localeCompare(b.scheduledDate ?? "")),
    [drafts],
  );
  const scheduledCount = drafts.filter((draft) => draft.scheduledDate).length;
  const draggingDraft = draggingId ? drafts.find((draft) => draft.id === draggingId) : null;

  function startDrag(event: DragEvent<HTMLElement>, draft: CourseScheduleDraft) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_TYPE, draft.id);
    event.dataTransfer.setData("text/plain", draft.id);
    setDraggingId(draft.id);
    setNotice("");
  }

  function draggedId(event: DragEvent<HTMLElement>) {
    return event.dataTransfer.getData(DRAG_TYPE) || event.dataTransfer.getData("text/plain") || draggingId;
  }

  async function updateDraft(id: string, patch: Partial<Pick<CourseScheduleDraft, "instructorName" | "topic" | "scheduledDate">>, successMessage: string) {
    const previous = drafts.find((draft) => draft.id === id);
    if (!previous || busyId) return;
    setBusyId(id);
    setError("");
    setNotice("");
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
    try {
      const updated = await responseData<CourseScheduleDraft>(await fetch(`/api/course-schedule-planner/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }));
      setDrafts((current) => current.map((draft) => draft.id === id ? updated : draft));
      setNotice(successMessage);
    } catch (reason) {
      setDrafts((current) => current.map((draft) => draft.id === id ? previous : draft));
      setError(reason instanceof Error ? reason.message : "예비 강의를 수정하지 못했습니다.");
    } finally {
      setBusyId("");
    }
  }

  async function scheduleFromDrop(event: DragEvent<HTMLElement>, scheduledDate: string | null) {
    event.preventDefault();
    const id = draggedId(event);
    setDraggingId(null);
    setDropDate(null);
    const draft = id ? drafts.find((item) => item.id === id) : null;
    if (!draft || draft.scheduledDate === scheduledDate) return;
    await updateDraft(
      draft.id,
      { scheduledDate },
      scheduledDate ? `${shortDate(scheduledDate)}로 일정을 배정했습니다.` : "일정 배정을 해제했습니다.",
    );
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault();
    if (!instructorName.trim() || !topic.trim() || creating) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const created = await responseData<CourseScheduleDraft>(await fetch("/api/course-schedule-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructorName, topic }),
      }));
      setDrafts((current) => [...current, created]);
      setInstructorName("");
      setTopic("");
      setNotice("예비 강의 카드를 만들었습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "예비 강의를 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  }

  function openEdit(draft: CourseScheduleDraft) {
    setEditing(draft);
    setEditInstructor(draft.instructorName);
    setEditTopic(draft.topic);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editInstructor.trim() || !editTopic.trim()) return;
    await updateDraft(editing.id, { instructorName: editInstructor, topic: editTopic }, "예비 강의 정보를 수정했습니다.");
    setEditing(null);
  }

  async function deleteDraft() {
    if (!deleteTarget || busyId) return;
    const target = deleteTarget;
    setBusyId(target.id);
    setError("");
    try {
      const response = await fetch(`/api/course-schedule-planner/${target.id}`, { method: "DELETE" });
      if (!response.ok) await responseData(response);
      setDrafts((current) => current.filter((draft) => draft.id !== target.id));
      setDeleteTarget(null);
      setNotice("예비 강의를 삭제했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "예비 강의를 삭제하지 못했습니다.");
    } finally {
      setBusyId("");
    }
  }

  function renderDraftCard(draft: CourseScheduleDraft) {
    const color = COLORS[draft.colorIndex % COLORS.length];
    return <article key={draft.id} draggable onDragStart={(event) => startDrag(event, draft)} onDragEnd={() => { setDraggingId(null); setDropDate(null); }} className={`cursor-grab rounded-xl border p-3 shadow-sm transition active:cursor-grabbing ${color.card} ${draggingId === draft.id ? "opacity-50" : ""}`}>
      <div className="flex items-start gap-2"><GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-semibold">{draft.topic}</h3><p className="mt-1 text-xs text-muted-foreground">{draft.instructorName}</p></div>{busyId === draft.id ? <Loader2 className="size-4 animate-spin" /> : <div className="flex"><Button type="button" size="icon-xs" variant="ghost" aria-label={`${draft.topic} 수정`} onClick={() => openEdit(draft)}><Pencil /></Button><Button type="button" size="icon-xs" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`${draft.topic} 삭제`} onClick={() => setDeleteTarget(draft)}><Trash2 /></Button></div>}</div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-2"><span className="flex items-center gap-1.5 text-xs"><span className={`size-2 rounded-full ${color.dot}`} />{draft.scheduledDate ? shortDate(draft.scheduledDate) : "미배정"}</span>{draft.scheduledDate ? <Button type="button" size="xs" variant="ghost" onClick={() => void updateDraft(draft.id, { scheduledDate: null }, "일정 배정을 해제했습니다.")}><CalendarX2 />해제</Button> : null}</div>
    </article>;
  }

  return <main className="mx-auto max-w-[1800px] px-5 py-8 lg:px-8 lg:py-10">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
      <div><Badge variant="outline" className="mb-3">강의 일정 시뮬레이션</Badge><h1 className="text-3xl font-semibold tracking-tight">강의 일정 플래너</h1><p className="mt-2 text-muted-foreground">예비 강의를 달력에 배치해 전체 강의 흐름을 미리 확인합니다.</p></div>
      <div className="flex flex-wrap gap-2"><Badge variant="secondary">예비 강의 {drafts.length}개</Badge><Badge variant="secondary">일정 배정 {scheduledCount}개</Badge><Badge variant="outline">확정 강의 {initialData.confirmedCourses.length}개</Badge></div>
    </div>

    {error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="mt-5 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">{notice}</p> : null}

    <div className="mt-6 grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="size-5 text-primary" />예비 강의 만들기</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(event) => void createDraft(event)}>
              <div className="space-y-1.5"><Label htmlFor="draft-instructor">강사명</Label><Input id="draft-instructor" value={instructorName} maxLength={100} onChange={(event) => setInstructorName(event.target.value)} placeholder="예: 김해준" /></div>
              <div className="space-y-1.5"><Label htmlFor="draft-topic">강의주제</Label><Input id="draft-topic" value={topic} maxLength={200} onChange={(event) => setTopic(event.target.value)} placeholder="예: 광고중개 부업" /></div>
              <Button className="w-full" type="submit" disabled={creating || !instructorName.trim() || !topic.trim()}>{creating ? <Loader2 className="animate-spin" /> : <Plus />}{creating ? "만드는 중…" : "카드 만들기"}</Button>
            </form>
          </CardContent>
        </Card>

        <section
          className={`space-y-3 rounded-xl border border-dashed p-3 transition ${draggingDraft?.scheduledDate ? "border-sky-400 bg-sky-50/70 ring-2 ring-sky-200" : "border-border"}`}
          onDragOver={(event) => { if (draggingId) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
          onDrop={(event) => void scheduleFromDrop(event, null)}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><h2 className="font-semibold">미배정</h2><Badge variant="secondary">{unassignedDrafts.length}</Badge></div>
            <span className="text-xs text-muted-foreground">달력으로 끌어 배정</span>
          </div>
          {draggingDraft?.scheduledDate ? <div className="grid min-h-20 place-items-center rounded-lg border-2 border-dashed border-sky-300 bg-sky-50 text-center text-sm font-medium text-sky-900"><span><CalendarX2 className="mx-auto mb-1 size-5" />여기에 놓으면 일정 해제</span></div> : null}
          <div className="space-y-3">
            {unassignedDrafts.map(renderDraftCard)}
            {!unassignedDrafts.length && !draggingDraft?.scheduledDate ? <div className="grid min-h-24 place-items-center rounded-lg bg-muted/30 text-muted-foreground"><span className="text-center text-sm"><CalendarClock className="mx-auto mb-2 size-5" />{drafts.length ? "모든 예비 강의가 배정되었습니다." : "첫 예비 강의를 만들어 주세요."}</span></div> : null}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2"><h2 className="font-semibold">배정 완료</h2><Badge variant="secondary">{assignedDrafts.length}</Badge></div>
            <span className="text-xs text-muted-foreground">날짜순</span>
          </div>
          <div className="space-y-3">
            {assignedDrafts.map(renderDraftCard)}
            {!assignedDrafts.length ? <div className="grid min-h-20 place-items-center rounded-lg bg-muted/30 text-muted-foreground"><span className="text-center text-sm"><CalendarCheck2 className="mx-auto mb-2 size-5" />배정된 예비 강의가 없습니다.</span></div> : null}
          </div>
        </section>
      </aside>

      <Card className="min-w-0">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" />{monthTitle(month)}</CardTitle><p className="mt-1 text-xs text-muted-foreground">색상 카드는 예비 강의, 진한 카드는 확정된 무료 웨비나입니다.</p></div>
          <div className="flex shrink-0 items-center gap-1"><Button type="button" size="sm" variant="outline" onClick={() => setMonth(initialData.today.slice(0, 7))}>오늘</Button><Button type="button" size="icon-sm" variant="ghost" aria-label="이전 달" onClick={() => setMonth((current) => shiftMonth(current, -1))}><ChevronLeft /></Button><Button type="button" size="icon-sm" variant="ghost" aria-label="다음 달" onClick={() => setMonth((current) => shiftMonth(current, 1))}><ChevronRight /></Button></div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[900px] overflow-hidden rounded-xl border">
            <div className="grid grid-cols-7 border-b bg-muted/40">{WEEKDAYS.map((day, index) => <div key={day} className={`px-2 py-2 text-center text-xs font-medium ${index === 0 ? "text-red-600" : index === 6 ? "text-blue-600" : "text-muted-foreground"}`}>{day}</div>)}</div>
            <div className="grid grid-cols-7">
              {days.map((day, dayIndex) => {
                const inMonth = day.startsWith(month);
                const draftEvents = draftsByDate.get(day) ?? [];
                const confirmedEvents = confirmedByDate.get(day) ?? [];
                const holidayNames = initialData.holidays[day] ?? [];
                const isSunday = dayIndex % 7 === 0;
                const isSaturday = dayIndex % 7 === 6;
                const isRedDay = isSunday || holidayNames.length > 0;
                const dayBackground = dropDate === day
                  ? "bg-sky-100 ring-2 ring-inset ring-sky-400"
                  : isRedDay
                    ? inMonth ? "bg-red-50" : "bg-red-50/50"
                    : isSaturday
                      ? inMonth ? "bg-sky-50" : "bg-sky-50/50"
                      : inMonth ? "bg-background" : "bg-muted/20";
                const dayText = isRedDay ? "text-red-600" : isSaturday ? "text-blue-600" : inMonth ? "text-foreground" : "text-muted-foreground/60";
                return <div key={day} onDragEnter={() => setDropDate(day)} onDragOver={(event) => { if (draggingId) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropDate(day); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropDate(null); }} onDrop={(event) => void scheduleFromDrop(event, day)} className={`min-h-36 border-r border-b p-1.5 transition-colors [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0 ${dayBackground}`}>
                  <div className="mb-1 flex min-h-6 items-start justify-between gap-1 px-1 text-xs font-medium">
                    <span className={day === initialData.today ? "inline-grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground" : dayText}>{Number(day.slice(-2))}</span>
                    {holidayNames.length ? <span className="truncate pt-0.5 text-[10px] text-red-600" title={holidayNames.join(", ")}>{holidayNames.join(" · ")}</span> : null}
                  </div>
                  <div className="space-y-1">
                    {confirmedEvents.map((course) => <Link key={course.id} href={`/services/course-operations/${course.id}`} title={`${course.name} · ${course.instructorName}`} className="block rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-[11px] leading-4 text-white shadow-sm hover:bg-slate-700"><span className="flex items-center gap-1 font-semibold"><CalendarCheck2 className="size-3" />확정{course.cohort ? ` · ${course.cohort}기` : ""}</span><span className="mt-0.5 block truncate">{course.name}</span><span className="block truncate text-slate-300">{course.instructorName}</span></Link>)}
                    {draftEvents.map((draft) => { const color = COLORS[draft.colorIndex % COLORS.length]; return <div key={draft.id} draggable onDragStart={(event) => startDrag(event, draft)} onDragEnd={() => { setDraggingId(null); setDropDate(null); }} title={`${draft.topic} · ${draft.instructorName}`} className={`cursor-grab rounded-md border px-2 py-1.5 text-[11px] leading-4 shadow-sm active:cursor-grabbing ${color.event} ${draggingId === draft.id ? "opacity-45" : ""}`}><span className="flex items-center gap-1 font-semibold"><GripVertical className="size-3" />예비</span><span className="mt-0.5 block truncate">{draft.topic}</span><span className="block truncate opacity-70">{draft.instructorName}</span></div>; })}
                  </div>
                </div>;
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>예비 강의 수정</DialogTitle><DialogDescription>강사명과 강의주제를 수정합니다.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={(event) => void saveEdit(event)}><div className="space-y-1.5"><Label htmlFor="edit-instructor">강사명</Label><Input id="edit-instructor" autoFocus value={editInstructor} maxLength={100} onChange={(event) => setEditInstructor(event.target.value)} /></div><div className="space-y-1.5"><Label htmlFor="edit-topic">강의주제</Label><Input id="edit-topic" value={editTopic} maxLength={200} onChange={(event) => setEditTopic(event.target.value)} /></div><DialogFooter><DialogClose asChild><Button type="button" variant="outline">취소</Button></DialogClose><Button type="submit" disabled={!editInstructor.trim() || !editTopic.trim() || busyId === editing?.id}>{busyId === editing?.id ? <Loader2 className="animate-spin" /> : <Pencil />}수정 저장</Button></DialogFooter></form></DialogContent>
    </Dialog>

    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !busyId) setDeleteTarget(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>예비 강의를 삭제할까요?</AlertDialogTitle><AlertDialogDescription>‘{deleteTarget?.topic}’ 카드와 배정한 일정이 함께 제거됩니다.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={Boolean(busyId)}>취소</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={Boolean(busyId)} onClick={(event) => { event.preventDefault(); void deleteDraft(); }}>{busyId === deleteTarget?.id ? <Loader2 className="animate-spin" /> : <Trash2 />}삭제</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
