"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DURATIONS, START_TIMES, eventSchema, formatDuration, formatEventTime, formatTime } from "@/lib/shared-calendar/calendar";
import type { CalendarCourse, CalendarDraft, CalendarEvent, MeetingType } from "@/lib/shared-calendar/types";

export const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";

export function CalendarEventForm({ event, date, types, courses, initialCourseId, onClose, onSaved, onDeleted }: {
  event: CalendarEvent | null;
  date: string;
  types: MeetingType[];
  courses: CalendarCourse[];
  initialCourseId?: string;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState<CalendarDraft>(() => event ? {
    title: event.title, eventDate: event.event_date, startMinutes: event.start_minutes,
    durationMinutes: event.duration_minutes, meetingTypeId: event.meeting_type_id, courseId: event.course_id, notes: event.notes,
  } : {
    title: "", eventDate: date, startMinutes: 540, durationMinutes: 60,
    meetingTypeId: (initialCourseId ? types.find((type) => type.code === "instructor_zoom") : types[0])?.id ?? "",
    courseId: initialCourseId ?? null, notes: "",
  });
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selectedType = types.find((type) => type.id === draft.meetingTypeId);

  async function save(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (pending.current) return;
    const parsed = eventSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(event ? `/api/shared-calendar/${event.id}` : "/api/shared-calendar", {
        method: event ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, ...(event ? { version: event.version } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "일정을 저장하지 못했습니다.");
      onSaved(body.event);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "일정을 저장하지 못했습니다."); }
    finally { pending.current = false; setBusy(false); }
  }

  async function remove() {
    if (!event || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/shared-calendar/${event.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: event.version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "일정을 삭제하지 못했습니다.");
      onDeleted(event.id);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "일정을 삭제하지 못했습니다."); }
    finally { pending.current = false; setBusy(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{event ? "일정 수정" : "일정 등록"}</DialogTitle></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <label className="grid gap-2">일정 제목<Input required maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">날짜<Input type="date" required min="2000-01-01" max="2100-12-31" value={draft.eventDate} onChange={(e) => setDraft({ ...draft, eventDate: e.target.value })} /></label>
            <label className="grid gap-2">회의 종류<select aria-label="회의 종류" className={selectClass} required value={draft.meetingTypeId} onChange={(e) => { setDraft({ ...draft, meetingTypeId: e.target.value, courseId: null }); }}>
              <option value="" disabled>종류 선택</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select></label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-2">시작시간<select aria-label="시작시간" className={selectClass} value={draft.startMinutes} onChange={(e) => setDraft({ ...draft, startMinutes: Number(e.target.value) })}>
              {START_TIMES.map((minutes) => <option key={minutes} value={minutes}>{formatTime(minutes)}</option>)}
            </select></label>
            <label className="grid gap-2">소요시간<select aria-label="소요시간" className={selectClass} value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })}>
              {DURATIONS.map((minutes) => <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>)}
            </select></label>
          </div>
          <p className="text-xs text-muted-foreground">한국시간 · 시작 08:00~21:00 · 소요 30분~24시간, 30분 단위<br />{formatEventTime(draft.startMinutes, draft.durationMinutes)}</p>
          {selectedType?.code === "instructor_zoom" ? <label className="grid gap-2">연결 강의<select aria-label="연결 강의" className={selectClass} value={draft.courseId ?? ""} onChange={(e) => setDraft({ ...draft, courseId: e.target.value || null })}>
            <option value="">연결 안 함</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name} · {course.instructor_name}{course.cohort ? ` · ${course.cohort}` : ""}</option>)}
          </select><span className="text-xs text-muted-foreground">연결하면 강의 상세페이지에도 일정이 표시됩니다.</span></label> : null}
          <label className="grid gap-2">메모<textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" maxLength={2000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
        </fieldset>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {confirmDelete ? <div className="rounded-md border border-destructive/40 p-3"><p className="mb-3">이 일정을 삭제할까요? 모든 사용자와 연결 강의에서 사라집니다.</p><div className="flex gap-2"><Button type="button" variant="destructive" disabled={busy} onClick={remove}>삭제 확인</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>삭제 취소</Button></div></div> : null}
        <DialogFooter>
          {event ? <Button type="button" variant="destructive" className="sm:mr-auto" disabled={busy} onClick={() => setConfirmDelete(true)}>일정 삭제</Button> : null}
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>취소</Button>
          <Button type="submit" disabled={busy || confirmDelete}>{busy ? "처리 중…" : event ? "변경 저장" : "일정 등록"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
