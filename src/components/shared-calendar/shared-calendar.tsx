"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ListPlus, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CalendarEventForm, selectClass } from "./event-form";
import { CalendarBulkForm } from "./bulk-form";
import { formatCalendarTime, formatLocation, formatTime, monthDays, shiftMonth } from "@/lib/shared-calendar/calendar";
import type { CalendarCourse, CalendarEvent, CalendarSourceEvent, MeetingType } from "@/lib/shared-calendar/types";
import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  instructor_zoom: "bg-blue-100 text-blue-900", rehearsal: "bg-amber-100 text-amber-950",
  webinar: "bg-violet-100 text-violet-900", weekly_meeting: "bg-emerald-100 text-emerald-900",
};

export function SharedCalendar({ today, initialEvents, initialSources = [], initialSourcesWarning = "", initialTypes, courses, initialError, initialCourseId, isAdmin = false }: {
  today: string; initialEvents: CalendarEvent[]; initialSources?: CalendarSourceEvent[]; initialSourcesWarning?: string; initialTypes: MeetingType[]; courses: CalendarCourse[]; initialError?: string; initialCourseId?: string; isAdmin?: boolean;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(today);
  const [events, setEvents] = useState(initialEvents);
  const [sources, setSources] = useState(initialSources);
  const [sourcesWarning, setSourcesWarning] = useState(initialSourcesWarning);
  const [showWebinars, setShowWebinars] = useState(true);
  const [showLeaves, setShowLeaves] = useState(false);
  const [types, setTypes] = useState(initialTypes);
  const [filter, setFilter] = useState("");
  const [editor, setEditor] = useState<{ event: CalendarEvent | null; date: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [notice, setNotice] = useState("");
  const [moveError, setMoveError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const mutation = useRef(0);
  const dragging = useRef<CalendarEvent | null>(null);
  const movePending = useRef(false);
  const [moving, setMoving] = useState(false);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const days = monthDays(month);

  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    async function refresh() {
      controller?.abort(); controller = new AbortController();
      const requestedMutation = mutation.current;
      const range = monthDays(month);
      try {
        const response = await fetch(`/api/shared-calendar?from=${range[0]}&to=${range[41]}&includeLeaves=${showLeaves}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "일정을 불러오지 못했습니다.");
        if (active && requestedMutation === mutation.current) { setEvents(body.events); setTypes(body.meetingTypes); setSources(body.sources ?? []); setSourcesWarning(body.sourcesWarning ?? ""); setError(""); }
      } catch (failure) {
        if (active && !(failure instanceof Error && failure.name === "AbortError")) setError(failure instanceof Error ? failure.message : "일정을 불러오지 못했습니다.");
      } finally { if (active) setLoading(false); }
    }
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(onVisible, 30000);
    window.addEventListener("focus", onVisible);
    return () => { active = false; controller?.abort(); window.clearInterval(timer); window.removeEventListener("focus", onVisible); };
  }, [month, reload, showLeaves]);

  function moveMonth(offset: number) {
    const next = shiftMonth(month, offset);
    if (next < "2000-01" || next > "2100-12") return;
    setMonth(next); setSelectedDate(`${next}-01`); setEvents([]); setSources([]); setLoading(true); setNotice("");
  }

  function addOnDate(date: string) {
    if (!types.length || loading || movePending.current) return;
    setSelectedDate(date); setNotice(""); setEditor({ event: null, date });
  }

  async function dropOnDate(date: string) {
    const event = dragging.current;
    dragging.current = null; setDropDate(null);
    if (!event || event.event_date === date || movePending.current) return;
    movePending.current = true; setMoving(true); setNotice(""); setMoveError("");
    // Invalidate any in-flight refresh before starting and after finishing a move.
    mutation.current += 1;
    try {
      const response = await fetch(`/api/shared-calendar/${event.id}/move`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventDate: date, version: event.version }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "일정 날짜를 변경하지 못했습니다.");
      const moved = body.event as CalendarEvent;
      setEvents((current) => [...current.filter((item) => item.id !== event.id), moved].sort((a, b) => a.start_minutes - b.start_minutes));
      setSelectedDate(date); setMonth(date.slice(0, 7)); setError(""); setNotice("일정 날짜를 변경했습니다.");
    } catch (failure) { setMoveError(failure instanceof Error ? failure.message : "일정 날짜를 변경하지 못했습니다."); }
    finally { mutation.current += 1; movePending.current = false; setMoving(false); setReload((value) => value + 1); }
  }
  const visible = filter ? events.filter((event) => event.meeting_type_id === filter) : events;
  const visibleSources = sources.filter((event) => event.source === "webinar"
    ? showWebinars && (!filter || types.find((type) => type.id === filter)?.code === "webinar")
    : showLeaves && !filter);
  const byDay = new Map<string, (CalendarEvent | CalendarSourceEvent)[]>();
  for (const event of [...visible, ...visibleSources]) { const list = byDay.get(event.event_date) ?? []; list.push(event); byDay.set(event.event_date, list); }
  for (const list of byDay.values()) list.sort((a, b) => a.start_minutes - b.start_minutes || a.id.localeCompare(b.id));
  const dayEvents = byDay.get(selectedDate) ?? [];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="이전 달" onClick={() => moveMonth(-1)}><ChevronLeft /></Button>
        <h2 className="min-w-32 text-center text-lg font-semibold">{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</h2>
        <Button variant="outline" size="icon-sm" aria-label="다음 달" onClick={() => moveMonth(1)}><ChevronRight /></Button>
        <Button variant="ghost" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDate(today); }}>오늘</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="calendar-type-filter">회의 종류 필터</label>
        <select id="calendar-type-filter" className={cn(selectClass, "w-auto max-w-48")} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">모든 종류</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
        <Button variant="outline" size="icon-sm" aria-label="일정 새로고침" disabled={loading} onClick={() => { setLoading(true); setReload((value) => value + 1); }}><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
        <Button variant="outline" disabled={!types.length || loading || moving} onClick={() => setBulkOpen(true)}><ListPlus />일괄 입력</Button>
        <Button disabled={!types.length || loading || moving} onClick={() => addOnDate(selectedDate)}><Plus />일정 등록</Button>
      </div>
    </div>
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={showWebinars} onChange={(e) => setShowWebinars(e.target.checked)} />강의 웨비나 표시</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={showLeaves} aria-describedby="calendar-leave-help" onChange={(e) => { setShowLeaves(e.target.checked); setSources((current) => current.filter((event) => event.source !== "leave")); setSourcesWarning(""); setLoading(true); }} />직원 휴가 표시</label>
      <p id="calendar-leave-help" className="w-full text-xs text-muted-foreground">직원 휴가는 승인된 종일·반차만 표시합니다. 웨비나와 휴가는 원래 강의·휴가 관리 화면에서 수정합니다.</p>
    </div>
    {error || moveError ? <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error || moveError}</p> : null}
    {sourcesWarning ? <p role="alert" className="rounded-md border border-amber-300 p-3 text-sm text-amber-900">{sourcesWarning}</p> : null}
    {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
    <p className="text-xs text-muted-foreground">날짜를 더블클릭하면 등록, 일정을 더블클릭하면 수정합니다. 일정을 다른 날짜로 드래그해 이동할 수 있습니다. 키보드에서는 날짜나 일정에 초점을 맞추고 Enter 키를 누르세요.</p>
    {moving ? <p role="status" className="text-sm text-muted-foreground">일정 날짜를 변경하는 중…</p> : null}
    <div className="overflow-hidden rounded-lg border bg-background" aria-busy={loading}>
      <div className="grid grid-cols-7 bg-muted/40">{["일", "월", "화", "수", "목", "금", "토"].map((day, index) => <div key={day} className={cn("border-b py-3 text-center text-sm font-medium", index === 0 && "text-red-600", index === 6 && "text-blue-600")}>{day}</div>)}</div>
      <div className="grid grid-cols-7">{days.map((date) => <div key={date} data-calendar-date={date} onDoubleClick={() => addOnDate(date)} onDragOver={(e) => { if (dragging.current && !movePending.current) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropDate(date); } }} onDragLeave={(e) => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDropDate((current) => current === date ? null : current); }} onDrop={(e) => { e.preventDefault(); void dropOnDate(date); }} className={cn("min-h-20 border-b border-r p-1 last:border-r-0 sm:min-h-32 sm:p-2", date.slice(0, 7) !== month && "bg-muted/30", selectedDate === date && "bg-blue-50/60", dropDate === date && "bg-blue-100 ring-2 ring-inset ring-blue-500")}>
        <button type="button" aria-label={`${date} 일정 보기`} aria-pressed={selectedDate === date} onClick={(e) => { setSelectedDate(date); if (e.detail === 0) addOnDate(date); }} className={cn("grid size-7 place-items-center rounded-full text-sm focus-visible:outline-2 focus-visible:outline-ring", date === today && "bg-primary text-primary-foreground", date.slice(0, 7) !== month && "opacity-50")}>{Number(date.slice(8))}</button>
        <div className="mt-1 space-y-1">{(byDay.get(date) ?? []).map((event) => "source" in event ? <CalendarSourceLink key={event.id} event={event} compact /> : <button key={event.id} type="button" disabled={moving} draggable={!moving} aria-label={`${event.title} 수정`} title={`${event.meeting_type.name} · ${event.title} · ${formatCalendarTime(event)} · ${formatLocation(event.location_kind, event.location_text)} · 더블클릭으로 수정`} onClick={(e) => { e.stopPropagation(); setSelectedDate(date); if (e.detail === 0) setEditor({ event, date }); }} onDoubleClick={(e) => { e.stopPropagation(); setSelectedDate(date); setEditor({ event, date }); }} onDragStart={(e) => { dragging.current = event; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", event.id); }} onDragEnd={() => { dragging.current = null; setDropDate(null); }} className={cn("block w-full cursor-grab truncate rounded px-1 py-1 text-left text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing disabled:opacity-50 sm:px-2 sm:text-xs", COLORS[event.meeting_type.code ?? ""] ?? "bg-slate-100 text-slate-900")}><span className="hidden sm:inline">{event.time_tbd ? "시간 미정" : formatTime(event.start_minutes)} </span>{event.title}</button>)}</div>
      </div>)}</div>
    </div>
    <section className="rounded-lg border bg-background p-5">
      <h2 className="mb-4 text-lg font-semibold">{selectedDate.replaceAll("-", ".")} 일정</h2>
      {loading ? <p role="status" className="text-sm text-muted-foreground">일정을 불러오는 중…</p> : dayEvents.length ? <ul className="divide-y">{dayEvents.map((event) => "source" in event ? <li key={event.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
        <CalendarSourceLink event={event} />
        <p className="text-sm text-muted-foreground">{event.source === "webinar" ? "웨비나" : "직원 휴가"} · {event.time_label}</p>
      </li> : <li key={event.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
        <button type="button" disabled={moving} title="더블클릭으로 수정" className="text-left font-semibold underline-offset-4 hover:underline" onClick={(e) => { if (e.detail === 0) setEditor({ event, date: selectedDate }); }} onDoubleClick={() => setEditor({ event, date: selectedDate })}>{event.title}</button>
        <p className="text-sm text-muted-foreground">{event.meeting_type.name} · {formatCalendarTime(event)}</p>
        <p className="text-sm text-muted-foreground">장소: {formatLocation(event.location_kind, event.location_text)}</p>
        {event.course ? <Link className="block text-sm text-blue-700 underline underline-offset-4" href={`/services/course-operations/${event.course.id}`}>{event.course.name} · {event.course.instructor_name}</Link> : null}
        {event.notes ? <p className="whitespace-pre-wrap break-words text-sm">{event.notes}</p> : null}
      </li>)}</ul> : <p className="text-sm text-muted-foreground">{error ? "조회에 실패했습니다. 새로고침해 주세요." : "등록된 일정이 없습니다. 날짜를 더블클릭하거나 일정 등록 버튼을 눌러 주세요."}</p>}
    </section>
    {bulkOpen ? <CalendarBulkForm year={Number(month.slice(0, 4))} types={types} courses={courses} isAdmin={isAdmin} onClose={() => setBulkOpen(false)} onImported={(added, meetingTypes, count, alreadyImported) => {
      mutation.current += 1; const ids = new Set(added.map((event) => event.id));
      setEvents((current) => [...current.filter((event) => !ids.has(event.id)), ...added].sort((a, b) => a.start_minutes - b.start_minutes));
      setTypes(meetingTypes); setBulkOpen(false); setMoveError(""); setNotice(alreadyImported ? `이미 등록된 ${count}개 일정의 결과를 확인했습니다. 중복 추가하지 않았습니다.` : `${count}개 일정을 등록했습니다.`);
      if (added[0]) { setSelectedDate(added[0].event_date); setMonth(added[0].event_date.slice(0, 7)); }
      setReload((value) => value + 1);
    }} /> : null}
    {editor ? <CalendarEventForm event={editor.event} date={editor.date} types={types} courses={courses} initialCourseId={initialCourseId} onClose={() => setEditor(null)} onSaved={(event) => {
      mutation.current += 1; setEvents((current) => [...current.filter((item) => item.id !== event.id), event].sort((a, b) => a.start_minutes - b.start_minutes));
      setSelectedDate(event.event_date); setMonth(event.event_date.slice(0, 7)); setEditor(null); setMoveError(""); setNotice("일정을 저장했습니다."); setReload((value) => value + 1);
    }} onDeleted={(id) => { mutation.current += 1; setEvents((current) => current.filter((event) => event.id !== id)); setEditor(null); setNotice("일정을 삭제했습니다."); }} /> : null}
  </div>;
}

function CalendarSourceLink({ event, compact = false }: { event: CalendarSourceEvent; compact?: boolean }) {
  return <Link href={event.href} draggable={false} onDragStart={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
    title={`${event.title} · ${event.time_label} · 원래 관리 화면에서 수정`}
    className={compact ? cn("block w-full truncate rounded px-1 py-1 text-left text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-ring sm:px-2 sm:text-xs", event.source === "webinar" ? COLORS.webinar : "bg-rose-100 text-rose-900") : "font-semibold underline-offset-4 hover:underline"}>
    {compact ? <span className="hidden sm:inline">{event.time_label} </span> : null}{event.title}
  </Link>;
}
