"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarPlus, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DURATIONS, START_TIMES, calendarShareText, eventSchema, formatDuration, formatCalendarTime, formatTime, updateDraftTitle } from "@/lib/shared-calendar/calendar";
import type { CalendarCourse, CalendarDraft, CalendarEvent, CalendarPerson, MeetingType } from "@/lib/shared-calendar/types";
import { buildGoogleCalendarUrl } from "@/lib/shared-calendar/google-calendar";
import { LocationFields } from "./location-fields";

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
    durationMinutes: event.duration_minutes, meetingTypeId: event.meeting_type_id, courseId: event.course_id, notes: event.notes, participantIds: event.participant_ids ?? [],
    locationKind: event.location_kind ?? "tbd", locationText: event.location_text ?? "", timeTbd: event.time_tbd ?? false,
  } : {
    title: "", eventDate: date, startMinutes: 540, durationMinutes: 60,
    meetingTypeId: (initialCourseId ? types.find((type) => type.code === "instructor_zoom") : types[0])?.id ?? "",
    courseId: initialCourseId ?? null, notes: "", participantIds: [], locationKind: "tbd", locationText: "", timeTbd: false,
  });
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [people, setPeople] = useState<CalendarPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState("");
  const [peopleReload, setPeopleReload] = useState(0);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [manualCopy, setManualCopy] = useState("");
  const selectedType = types.find((type) => type.id === draft.meetingTypeId);
  const knownIds = new Set(people.map((person) => person.id));
  const peopleOptions = [...people.filter((person) => person.active || draft.participantIds.includes(person.id)),
    ...draft.participantIds.filter((id) => !knownIds.has(id)).map((id) => ({ id, name: "삭제되었거나 워크스페이스를 떠난 사용자", active: false }))];

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function loadPeople() {
      try {
        const response = await fetch("/api/shared-calendar/participants", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error("참여자 목록을 불러오지 못했습니다. 참여자 없이도 저장할 수 있습니다.");
        if (active) { setPeople(body.people); setPeopleError(""); }
      } catch (failure) {
        if (active && !(failure instanceof Error && failure.name === "AbortError")) setPeopleError("참여자 목록을 불러오지 못했습니다. 기존 선택은 유지되며 참여자 없이도 저장할 수 있습니다.");
      } finally { if (active) setPeopleLoading(false); }
    }
    void loadPeople();
    return () => { active = false; controller.abort(); };
  }, [peopleReload]);

  async function share() {
    if (copyBusy) return;
    const course = courses.find((item) => item.id === draft.courseId);
    const text = calendarShareText(draft, { meetingType: selectedType?.name, course: course ? `${course.name} · ${course.instructor_name}` : undefined,
      participants: draft.participantIds.map((id) => peopleOptions.find((person) => person.id === id)?.name ?? "알 수 없는 사용자") });
    setCopyBusy(true); setCopyNotice(""); setManualCopy("");
    try {
      await navigator.clipboard.writeText(text);
      setCopyNotice("공유 내용을 클립보드에 복사했습니다. 카카오톡 등에 붙여넣어 주세요.");
    } catch { setManualCopy(text); setCopyNotice("클립보드에 접근할 수 없습니다. 아래 텍스트를 선택해 직접 복사해 주세요."); }
    finally { setCopyBusy(false); }
  }

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
          <label className="grid gap-2">일정 제목<Input aria-label="일정 제목" aria-describedby="calendar-title-help" required maxLength={120} value={draft.title} onChange={(e) => setDraft((current) => updateDraftTitle(current, e.target.value))} autoFocus /></label>
          <p id="calendar-title-help" className="text-xs text-muted-foreground">11시, 오후 2시 반, 14:30 등 제목의 시간을 자동 반영합니다. 오전·오후 표시가 없는 1~7시는 오후로 해석합니다. 08:00~21:00의 30분 단위만 인식하며 새 일정은 기본 1시간입니다. 시작시간은 직접 바꿀 수도 있습니다.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">날짜<Input type="date" required min="2000-01-01" max="2100-12-31" value={draft.eventDate} onChange={(e) => setDraft({ ...draft, eventDate: e.target.value })} /></label>
            <label className="grid gap-2">회의 종류<select aria-label="회의 종류" className={selectClass} required value={draft.meetingTypeId} onChange={(e) => { setDraft({ ...draft, meetingTypeId: e.target.value, courseId: null }); }}>
              <option value="" disabled>종류 선택</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.timeTbd} onChange={(e) => setDraft({ ...draft, timeTbd: e.target.checked })} />시간 미정</label>
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-2">시작시간<select aria-label="시작시간" disabled={draft.timeTbd} className={selectClass} value={draft.startMinutes} onChange={(e) => setDraft({ ...draft, startMinutes: Number(e.target.value) })}>
              {START_TIMES.map((minutes) => <option key={minutes} value={minutes}>{formatTime(minutes)}</option>)}
            </select></label>
            <label className="grid gap-2">소요시간<select aria-label="소요시간" className={selectClass} value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })}>
              {DURATIONS.map((minutes) => <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>)}
            </select></label>
          </div>
          <p className="text-xs text-muted-foreground">한국시간 · 시작 08:00~21:00 · 소요 30분~24시간, 30분 단위<br />{formatCalendarTime({ start_minutes: draft.startMinutes, duration_minutes: draft.durationMinutes, time_tbd: draft.timeTbd })}</p>
          <LocationFields kind={draft.locationKind} text={draft.locationText} onChange={(locationKind, locationText) => setDraft({ ...draft, locationKind, locationText })} />
          {selectedType?.code === "instructor_zoom" ? <label className="grid gap-2">연결 강의<select aria-label="연결 강의" className={selectClass} value={draft.courseId ?? ""} onChange={(e) => setDraft({ ...draft, courseId: e.target.value || null })}>
            <option value="">연결 안 함</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name} · {course.instructor_name}{course.cohort ? ` · ${course.cohort}` : ""}</option>)}
          </select><span className="text-xs text-muted-foreground">연결하면 강의 상세페이지에도 일정이 표시됩니다.</span></label> : null}
          <fieldset className="space-y-2 rounded-md border p-3" aria-describedby="calendar-participant-help">
            <legend className="px-1 text-sm font-medium">참여자</legend>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={peopleLoading || Boolean(peopleError)} onClick={() => setDraft((current) => ({ ...current, participantIds: Array.from(new Set([...current.participantIds, ...people.filter((person) => person.active).map((person) => person.id)])) }))}>전체 선택</Button>
              <Button type="button" size="sm" variant="ghost" disabled={!draft.participantIds.length} onClick={() => setDraft((current) => ({ ...current, participantIds: [] }))}>선택 해제</Button>
              <span className="text-xs text-muted-foreground">{draft.participantIds.length}명 선택</span>
            </div>
            <p id="calendar-participant-help" className="text-xs text-muted-foreground">참여자는 선택 사항입니다. 활성 사용자를 여러 명 선택할 수 있습니다.</p>
            {peopleLoading ? <p role="status" className="text-xs text-muted-foreground">참여자를 불러오는 중…</p> : peopleError ? <div><p role="alert" className="text-xs text-destructive">{peopleError}</p><Button type="button" variant="link" size="sm" onClick={() => { setPeopleLoading(true); setPeopleReload((value) => value + 1); }}>참여자 다시 불러오기</Button></div> : peopleOptions.length ? <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">{peopleOptions.map((person) => <label key={person.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.participantIds.includes(person.id)} onChange={(e) => setDraft((current) => ({ ...current, participantIds: e.target.checked ? [...current.participantIds, person.id] : current.participantIds.filter((id) => id !== person.id) }))} />{person.name}{!person.active ? " (기존 참여자)" : ""}</label>)}</div> : <p className="text-xs text-muted-foreground">선택할 활성 사용자가 없습니다. 참여자 없이 등록할 수 있습니다.</p>}
          </fieldset>
          <label className="grid gap-2">메모<textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" maxLength={2000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
        </fieldset>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {copyNotice ? <p role="status" className="text-sm text-muted-foreground">{copyNotice}</p> : null}
        {manualCopy ? <label className="grid gap-2 text-sm">공유 텍스트<textarea aria-label="공유 텍스트" readOnly autoFocus onFocus={(e) => e.currentTarget.select()} className="min-h-40 rounded-md border p-3 text-sm" value={manualCopy} /></label> : null}
        {event ? <div className="space-y-2 rounded-md border p-3">
          <Button asChild type="button" variant="outline" className="w-full" disabled={busy}>
            <a href={busy ? undefined : buildGoogleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" aria-disabled={busy} aria-describedby="calendar-google-help" tabIndex={busy ? -1 : undefined}><CalendarPlus />내 Google 캘린더로 보내기</a>
          </Button>
          <p id="calendar-google-help" className="text-xs text-muted-foreground">Google 계정을 선택한 뒤 캘린더에서 저장을 눌러 추가하세요. 저장된 일정 정보를 보냅니다. 수정한 내용은 변경 저장 후 보내세요.{event.time_tbd ? " 시간 미정 일정은 종일 일정으로 열립니다." : ""}</p>
        </div> : null}
        {confirmDelete ? <div className="rounded-md border border-destructive/40 p-3"><p className="mb-3">이 일정을 삭제할까요? 모든 사용자와 연결 강의에서 사라집니다.</p><div className="flex gap-2"><Button type="button" variant="destructive" disabled={busy} onClick={remove}>삭제 확인</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDelete(false)}>삭제 취소</Button></div></div> : null}
        <DialogFooter>
          {event ? <Button type="button" variant="destructive" className="sm:mr-auto" disabled={busy} onClick={() => setConfirmDelete(true)}>일정 삭제</Button> : null}
          {event ? <Button type="button" variant="outline" disabled={busy || copyBusy || (draft.participantIds.length > 0 && (peopleLoading || Boolean(peopleError)))} onClick={share}><Share2 />공유</Button> : null}
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>취소</Button>
          <Button type="submit" disabled={busy || confirmDelete}>{busy ? "처리 중…" : event ? "변경 저장" : "일정 등록"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
