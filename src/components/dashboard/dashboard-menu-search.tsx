"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, BookOpenCheck, CalendarDays, ChevronDown, Search, X } from "lucide-react";

import { DashboardCourseOptions } from "@/components/dashboard/dashboard-course-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { filterDashboardCourses, filterDashboardMenus, type DashboardCourseSearchItem, type DashboardMenuCustomKeywords } from "@/lib/dashboard/menu-search";
import type { CalendarSearchResult } from "@/lib/shared-calendar/types";

const MENU_CHIP_COLORS = [
  "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100 hover:text-sky-950",
  "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100 hover:text-violet-950",
  "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-950",
  "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950",
  "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 hover:text-rose-950",
  "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 hover:text-cyan-950",
  "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 hover:text-indigo-950",
  "border-lime-200 bg-lime-50 text-lime-900 hover:bg-lime-100 hover:text-lime-950",
] as const;

export function DashboardMenuSearch({
  courses,
  customKeywords,
}: {
  courses: DashboardCourseSearchItem[];
  customKeywords: DashboardMenuCustomKeywords;
}) {
  const inputId = useId();
  const resultsId = useId();
  const resultsPanel = useRef<HTMLDivElement>(null);
  const searchTargets = useRef<Array<HTMLElement | null>>([]);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [calendarResults, setCalendarResults] = useState<CalendarSearchResult[]>([]);
  const [calendarPending, setCalendarPending] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const deferredQuery = useDeferredValue(query);
  const menus = filterDashboardMenus(deferredQuery, customKeywords).slice(0, 8);
  const courseResults = filterDashboardCourses(courses, deferredQuery);
  const hasQuery = query.trim().length > 0;
  const calendarItems = hasQuery ? calendarResults.slice(0, 6) : [];
  const resultCount = menus.length + (hasQuery ? courseResults.length + calendarItems.length : 0);

  function updateQuery(value: string) {
    setQuery(value);
    setActiveIndex(0);
    if (!value.trim()) {
      setCalendarResults([]);
      setCalendarPending(false);
      setCalendarError("");
    } else {
      setCalendarPending(true);
      setCalendarError("");
    }
  }

  function moveActiveIndex(direction: 1 | -1) {
    if (!resultCount) return;
    setActiveIndex((current) => {
      if (current < 0) return direction === 1 ? 0 : resultCount - 1;
      return (current + direction + resultCount) % resultCount;
    });
  }

  function activateCurrentResult() {
    const target = searchTargets.current[activeIndex];
    if (!target) return;
    target.focus();
    target.click();
  }

  useEffect(() => {
    if (activeIndex < 0) return;
    const panel = resultsPanel.current;
    const target = searchTargets.current[activeIndex];
    if (!panel || !target) return;

    const panelBounds = panel.getBoundingClientRect();
    const targetBounds = target.getBoundingClientRect();
    const padding = 12;
    if (targetBounds.top < panelBounds.top + padding) {
      panel.scrollBy({ top: targetBounds.top - panelBounds.top - padding, behavior: "smooth" });
    } else if (targetBounds.bottom > panelBounds.bottom - padding) {
      panel.scrollBy({ top: targetBounds.bottom - panelBounds.bottom + padding, behavior: "smooth" });
    }
  }, [activeIndex]);

  useEffect(() => {
    const keyword = deferredQuery.trim();
    if (!keyword) return;
    const controller = new AbortController();
    void fetch(`/api/shared-calendar/search?q=${encodeURIComponent(keyword)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { message?: string; results?: CalendarSearchResult[] };
        if (!response.ok) throw new Error(body.message || "공용 캘린더 일정을 검색하지 못했습니다.");
        setCalendarResults(body.results ?? []);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setCalendarResults([]);
        setCalendarError(error instanceof Error ? error.message : "공용 캘린더 일정을 검색하지 못했습니다.");
      })
      .finally(() => { if (!controller.signal.aborted) setCalendarPending(false); });
    return () => controller.abort();
  }, [deferredQuery]);

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="메뉴 및 강사 검색">
      <label htmlFor={inputId} className="sr-only">메뉴 또는 강사 검색</label>
      <div className="relative">
        <Search className="absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <Input
          id={inputId}
          type="search"
          className="h-12 border-slate-200 bg-slate-50 pr-12 pl-11 text-base md:text-base"
          value={query}
          role="combobox"
          aria-expanded="true"
          aria-controls={resultsId}
          aria-activedescendant={activeIndex >= 0 ? `${resultsId}-item-${activeIndex}` : undefined}
          onFocus={() => { if (activeIndex < 0) setActiveIndex(0); }}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowRight") {
              event.preventDefault();
              moveActiveIndex(1);
            } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
              event.preventDefault();
              moveActiveIndex(-1);
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              activateCurrentResult();
            }
          }}
          placeholder="강사명 또는 메뉴명을 검색하세요"
          autoComplete="off"
        />
        {query ? <Button type="button" variant="ghost" size="icon-sm" className="absolute top-1/2 right-2 -translate-y-1/2" aria-label="검색어 지우기" onClick={() => updateQuery("")}><X /></Button> : null}
      </div>

      <div ref={resultsPanel} id={resultsId} role="listbox" className="mt-4 max-h-[min(32rem,calc(100dvh-10rem))] overflow-y-auto pr-1" aria-live="polite">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">{hasQuery ? "추천 메뉴" : "자주 찾는 메뉴"}</p>
        {menus.length ? <div className="flex flex-wrap gap-2">
          {menus.map((menu, index) => <Button key={menu.href} variant="outline" size="sm" className={`h-auto min-h-9 ${MENU_CHIP_COLORS[index % MENU_CHIP_COLORS.length]} ${activeIndex === index ? "ring-2 ring-slate-900 ring-offset-1" : ""}`} asChild>
            <Link id={`${resultsId}-item-${index}`} ref={(node) => { searchTargets.current[index] = node; }} role="option" aria-selected={activeIndex === index} href={menu.href} onMouseEnter={() => setActiveIndex(index)}><span>{menu.label}</span><ArrowRight className="size-3.5 opacity-60" /></Link>
          </Button>)}
        </div> : <p className="text-sm text-muted-foreground">일치하는 메뉴가 없습니다.</p>}

      {hasQuery && courseResults.length ? <div className="mt-5 border-t pt-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500">강사·강의 추천</p>
        <div className="grid gap-3 xl:grid-cols-2">
          {courseResults.map((course, courseIndex) => {
            const index = menus.length + courseIndex;
            return <DropdownMenu key={course.id}>
            <DropdownMenuTrigger asChild>
              <button id={`${resultsId}-item-${index}`} ref={(node) => { searchTargets.current[index] = node; }} role="option" aria-selected={activeIndex === index} type="button" aria-label={`${course.name} 이동 메뉴 열기`} onMouseEnter={() => setActiveIndex(index)} className={`group flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 data-[state=open]:border-blue-300 data-[state=open]:bg-blue-50/60 ${activeIndex === index ? "border-slate-900 ring-2 ring-slate-900 ring-offset-1" : ""}`}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><BookOpenCheck className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700 group-data-[state=open]:text-blue-700">{course.name}</span>
                    <Badge
                      variant="secondary"
                      className={course.status === "ongoing"
                        ? "shrink-0 bg-blue-50 text-blue-700"
                        : "shrink-0 bg-slate-100 text-slate-600"}
                    >
                      {course.status === "ongoing" ? "진행중" : "종료"}
                    </Badge>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{course.instructor || "강사 미정"} · {course.cohort || "기수 미정"} · {course.webinarDate}</span>
                </span>
                <ChevronDown className="mt-1 size-4 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180 group-data-[state=open]:text-blue-600" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DashboardCourseOptions courseId={course.id} />
          </DropdownMenu>;
          })}
        </div>
      </div> : hasQuery && !menus.length ? <p className="mt-4 text-sm text-muted-foreground">‘{query.trim()}’에 맞는 강사나 강의를 찾지 못했습니다.</p> : null}
      {hasQuery && (calendarPending || calendarResults.length > 0 || calendarError) ? <div className="mt-5 border-t pt-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500">공용 캘린더 일정</p>
          {calendarPending ? <p className="text-sm text-muted-foreground">일정을 검색하는 중입니다.</p> : calendarError ? <p className="text-sm text-destructive">{calendarError}</p> : <div className="grid gap-3 xl:grid-cols-2">
          {calendarItems.map((event, calendarIndex) => {
            const index = menus.length + courseResults.length + calendarIndex;
            return <Link id={`${resultsId}-item-${index}`} ref={(node) => { searchTargets.current[index] = node; }} role="option" aria-selected={activeIndex === index} key={`${event.source}:${event.id}`} href={`/calendar?date=${encodeURIComponent(event.event_date)}`} onMouseEnter={() => setActiveIndex(index)} className={`group flex items-start gap-3 rounded-xl border border-slate-200 p-3.5 transition-colors hover:border-violet-300 hover:bg-violet-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 ${activeIndex === index ? "border-slate-900 ring-2 ring-slate-900 ring-offset-1" : ""}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-700"><CalendarDays className="size-4" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900 group-hover:text-violet-700">{event.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{event.event_date.replaceAll("-", ".")} · {event.time_label} · {event.detail_label}</span>
              {event.location_label ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{event.location_label}</span> : null}
            </span>
            <ArrowRight className="mt-1 size-4 shrink-0 text-slate-400 group-hover:text-violet-600" aria-hidden="true" />
          </Link>;
          })}
        </div>}
      </div> : null}
      </div>
    </section>
  );
}
