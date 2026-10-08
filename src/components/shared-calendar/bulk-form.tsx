"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DURATIONS, START_TIMES, formatCalendarTime, formatDuration, formatTime, isDateKey } from "@/lib/shared-calendar/calendar";
import { bulkEventSchema, bulkImportSchema, bulkRowPayload, parseCalendarBulk, type BulkRow } from "@/lib/shared-calendar/bulk";
import type { CalendarCourse, CalendarDraft, CalendarEvent, CalendarPerson, MeetingType } from "@/lib/shared-calendar/types";
import { selectClass } from "./event-form";
import { LocationFields } from "./location-fields";

const EXAMPLE = "1. 10월 12일(월) / 오전 11시 / 줌 미팅 / 신예영 / 온라인 / 전원\n2. 10월 15일(목) / 오후 1시 / 릴스 촬영 / 김선아 / 오산 / 이지선, 윤지혜";

export function CalendarBulkForm({ year: initialYear, types, courses, isAdmin, onClose, onImported }: {
  year: number; types: MeetingType[]; courses: CalendarCourse[]; isAdmin: boolean;
  onClose: () => void;
  onImported: (events: CalendarEvent[], meetingTypes: MeetingType[], count: number, alreadyImported: boolean) => void;
}) {
  const [year, setYear] = useState(initialYear);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [people, setPeople] = useState<CalendarPerson[]>([]);
  const [peopleReady, setPeopleReady] = useState(false);
  const [peopleError, setPeopleError] = useState("");
  const [peopleReload, setPeopleReload] = useState(0);
  const [createMissingTypes, setCreateMissingTypes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const request = useRef<{ id: string; signature: string } | null>(null);
  const activePeople = people.filter((person) => person.active);
  const missingTypes = Array.from(new Set(rows.map((row) => row.newMeetingTypeName).filter((name): name is string => Boolean(name))));
  const unresolved = rows.some((row) => Object.values(row.issues).some(Boolean) || !bulkEventSchema.safeParse(bulkRowPayload(row)).success);
  const locked = busy || uncertain;
  const canSubmit = rows.length > 0 && !parseErrors.length && !unresolved && (!missingTypes.length || (isAdmin && createMissingTypes));

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    async function loadPeople() {
      try {
        const response = await fetch("/api/shared-calendar/participants", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Participant directory unavailable");
        const body = await response.json();
        if (active) { setPeople(body.people); setPeopleReady(true); setPeopleError(""); }
      } catch (failure) {
        if (active && !(failure instanceof Error && failure.name === "AbortError")) setPeopleError("참여자 목록을 불러오지 못했습니다. 다시 불러온 뒤 분석해 주세요.");
      }
    }
    void loadPeople(); return () => { active = false; controller.abort(); };
  }, [peopleReload]);

  function parse() {
    const result = parseCalendarBulk(text, year, types, people);
    setRows(result.rows); setParseErrors(result.errors); setError(""); setCreateMissingTypes(false);
    request.current = null;
  }

  function changeDraft(index: number, patch: Partial<CalendarDraft>, resolved?: keyof BulkRow["issues"]) {
    setRows((current) => current.map((row, i) => i === index ? { ...row, draft: { ...row.draft, ...patch }, issues: resolved ? { ...row.issues, [resolved]: undefined } : row.issues } : row));
    setError("");
  }

  function close() {
    if (busy) return;
    if (uncertain && !window.confirm("서버 처리 여부를 아직 확인하지 못했습니다. 같은 내용으로 다시 등록하면 중복을 방지할 수 있습니다. 그래도 닫을까요?")) return;
    onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !canSubmit) return;
    const payload = { createMissingTypes: missingTypes.length > 0 && createMissingTypes, events: rows.map(bulkRowPayload) };
    const signature = JSON.stringify(payload);
    if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    const parsed = bulkImportSchema.safeParse({ ...payload, requestId: request.current.id });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    pending.current = true; setBusy(true); setError("");
    let ambiguous = true;
    try {
      const response = await fetch("/api/shared-calendar/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (!response.ok && response.status < 500) ambiguous = false;
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "일괄 등록하지 못했습니다.");
      ambiguous = false;
      onImported(body.events, body.meetingTypes, body.count, body.alreadyImported);
    } catch (failure) {
      setUncertain(ambiguous);
      setError(ambiguous ? "서버 처리 여부를 확인하지 못했습니다. 내용을 바꾸지 않고 다시 등록하면 중복 없이 결과를 확인합니다." : failure instanceof Error ? failure.message : "일괄 등록하지 못했습니다.");
    } finally { pending.current = false; setBusy(false); }
  }

  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent aria-describedby={undefined} className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>일괄 입력</DialogTitle></DialogHeader>
      <form className="space-y-5" onSubmit={submit}>
        <fieldset disabled={locked} className="space-y-3">
          <label className="grid max-w-40 gap-2 text-sm">적용 연도<Input aria-label="적용 연도" type="number" min={2000} max={2100} required value={year} onChange={(e) => { setYear(Number(e.target.value)); setRows([]); setParseErrors([]); }} /></label>
          <label className="grid gap-2 text-sm">일정 목록<textarea aria-label="일정 목록" aria-describedby="calendar-bulk-help" className="min-h-40 w-full rounded-md border bg-background p-3 text-sm" maxLength={30000} placeholder={EXAMPLE} value={text} onChange={(e) => { setText(e.target.value); setRows([]); setParseErrors([]); }} autoFocus /></label>
          <p id="calendar-bulk-help" className="text-xs text-muted-foreground">날짜 / 시간 / 구분 / 대상자 / 장소 / 참여 인원 순서로 한 줄에 하나씩 입력하세요. 연도 없는 날짜는 적용 연도를 사용하며, 단일 시간은 기본 1시간입니다. 전원은 현재 활성 사용자 전체를 뜻합니다. 분석 후 날짜·시간·장소·참여자를 수정할 수 있으며, 확인이 필요한 항목은 해결해야 등록됩니다.</p>
          {peopleError ? <div><p role="alert" className="text-sm text-destructive">{peopleError}</p><Button type="button" variant="outline" onClick={() => { setPeopleError(""); setPeopleReady(false); setPeopleReload((value) => value + 1); }}>참여자 다시 불러오기</Button></div> : !peopleReady ? <p role="status" className="text-sm text-muted-foreground">참여자를 불러오는 중…</p> : null}
          <Button type="button" variant="outline" disabled={!peopleReady || !text.trim()} onClick={parse}>분석 및 미리보기</Button>
        </fieldset>
        {parseErrors.length ? <ul role="alert" className="space-y-1 text-sm text-destructive">{parseErrors.map((message) => <li key={message}>{message}</li>)}</ul> : null}
        {rows.length ? <div className="space-y-4">
          <p role="status" className="text-sm">{rows.length}개 일정 미리보기</p>
          <fieldset disabled={locked} className="space-y-4">
            {missingTypes.length ? <div className="rounded-md border p-3 text-sm">
              {isAdmin ? <label className="flex items-start gap-2"><input type="checkbox" checked={createMissingTypes} onChange={(e) => setCreateMissingTypes(e.target.checked)} />새 구분 추가: {missingTypes.join(", ")}</label> : <p role="alert">등록되지 않은 구분: {missingTypes.join(", ")}. 기존 회의 종류를 선택하거나 관리자에게 추가를 요청하세요.</p>}
            </div> : null}
            {rows.map((row, index) => {
              const checked = bulkEventSchema.safeParse(bulkRowPayload(row));
              const selectedType = types.find((type) => type.id === row.draft.meetingTypeId);
              return <section key={row.line} aria-label={`${index + 1}번 일정`} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{index + 1}번 일정</h3><Button type="button" variant="ghost" size="sm" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>이 일정 제외</Button></div>
                <label className="grid gap-2 text-sm">일정 제목<Input aria-label="일정 제목" maxLength={120} required value={row.draft.title} onChange={(e) => changeDraft(index, { title: e.target.value })} /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm">날짜<Input aria-label="날짜" type="date" min="2000-01-01" max="2100-12-31" required value={row.draft.eventDate} onChange={(e) => changeDraft(index, { eventDate: e.target.value }, "date")} /></label>
                  <label className="grid gap-2 text-sm">회의 종류<select aria-label="회의 종류" className={selectClass} value={row.newMeetingTypeName ? "__new__" : row.draft.meetingTypeId} onChange={(e) => { const id = e.target.value; setRows((current) => current.map((item, i) => i === index ? { ...item, newMeetingTypeName: null, draft: { ...item.draft, meetingTypeId: id, courseId: null } } : item)); }}>
                    {row.newMeetingTypeName ? <option value="__new__">새 구분: {row.newMeetingTypeName}</option> : null}{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </select></label>
                </div>
                {row.issues.date ? <div><p role="alert" className="text-xs text-destructive">{row.issues.date}</p>{isDateKey(row.draft.eventDate) ? <Button type="button" variant="link" size="sm" onClick={() => changeDraft(index, {}, "date")}>표시된 날짜로 확정</Button> : null}</div> : null}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row.draft.timeTbd} onChange={(e) => changeDraft(index, { timeTbd: e.target.checked }, "time")} />시간 미정</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-2 text-sm">시작시간<select aria-label="시작시간" className={selectClass} disabled={row.draft.timeTbd} value={row.draft.startMinutes} onChange={(e) => changeDraft(index, { startMinutes: Number(e.target.value) })}>{START_TIMES.map((value) => <option key={value} value={value}>{formatTime(value)}</option>)}</select></label>
                  <label className="grid gap-2 text-sm">소요시간<select aria-label="소요시간" className={selectClass} value={row.draft.durationMinutes} onChange={(e) => changeDraft(index, { durationMinutes: Number(e.target.value) }, "time")}>{DURATIONS.map((value) => <option key={value} value={value}>{formatDuration(value)}</option>)}</select></label>
                </div>
                {row.issues.time ? <div className="space-y-2"><p role="alert" className="text-xs text-destructive">{row.issues.time}</p>{row.endOptions.length ? <label className="grid gap-2 text-sm">종료시간 선택<select aria-label="종료시간 선택" className={selectClass} defaultValue="" onChange={(e) => changeDraft(index, { durationMinutes: Number(e.target.value) }, "time")}><option value="" disabled>종료시간 확인 필요</option>{row.endOptions.map((option) => <option key={option.durationMinutes} value={option.durationMinutes}>{option.label}</option>)}</select></label> : null}</div> : null}
                <p className="text-xs text-muted-foreground">{formatCalendarTime({ start_minutes: row.draft.startMinutes, duration_minutes: row.draft.durationMinutes, time_tbd: row.draft.timeTbd })}</p>
                <LocationFields kind={row.draft.locationKind} text={row.draft.locationText} onChange={(locationKind, locationText) => changeDraft(index, { locationKind, locationText })} />
                {selectedType?.code === "instructor_zoom" ? <label className="grid gap-2 text-sm">연결 강의<select aria-label="연결 강의" className={selectClass} value={row.draft.courseId ?? ""} onChange={(e) => changeDraft(index, { courseId: e.target.value || null })}><option value="">연결 안 함</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.name} · {course.instructor_name}</option>)}</select></label> : null}
                <label className="grid gap-2 text-sm">참여자<select aria-label="참여자" multiple size={Math.min(4, Math.max(2, activePeople.length))} className="w-full rounded-md border bg-background p-2 text-sm" value={row.draft.participantIds} onChange={(e) => changeDraft(index, { participantIds: Array.from(e.target.selectedOptions, (option) => option.value) })}>{activePeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => changeDraft(index, { participantIds: activePeople.map((person) => person.id) }, "participants")}>전원</Button><Button type="button" variant="ghost" size="sm" onClick={() => changeDraft(index, { participantIds: [] }, "participants")}>참여자 없음</Button><span className="text-xs">{row.draft.participantIds.length}명 선택</span></div>
                {row.issues.participants ? <div><p role="alert" className="text-xs text-destructive">{row.issues.participants}</p><Button type="button" variant="link" size="sm" onClick={() => changeDraft(index, {}, "participants")}>선택한 참여자로 확정</Button></div> : null}
                <label className="grid gap-2 text-sm">메모<textarea aria-label="메모" className="min-h-16 rounded-md border bg-background p-3 text-sm" maxLength={2000} value={row.draft.notes} onChange={(e) => changeDraft(index, { notes: e.target.value })} /></label>
                {!checked.success ? <p role="alert" className="text-xs text-destructive">{checked.error.issues[0].message}</p> : null}
              </section>;
            })}
          </fieldset>
        </div> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={close}>취소</Button><Button type="submit" disabled={busy || !canSubmit}>{busy ? "등록 중…" : `${rows.length}개 일정 등록`}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
