"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, BookOpenCheck, CalendarDays, ChevronDown, Search, X } from "lucide-react";

import { DashboardCourseOptions } from "@/components/dashboard/dashboard-course-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  filterDashboardCourses,
  filterDashboardMenus,
  type DashboardCourseSearchItem,
  type DashboardMenuCustomKeywords,
} from "@/lib/dashboard/menu-search";
import type { CalendarSearchResult } from "@/lib/shared-calendar/types";

type Bootstrap = {
  courses: DashboardCourseSearchItem[];
  customKeywords: DashboardMenuCustomKeywords;
};

const MENU_CHIP_COLORS = [
  "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
  "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100",
  "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
  "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
  "border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100",
] as const;

export function GlobalDashboardSearch() {
  const inputId = useId();
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState<Bootstrap>({ courses: [], customKeywords: {} });
  const [calendarResults, setCalendarResults] = useState<CalendarSearchResult[]>([]);
  const [calendarPending, setCalendarPending] = useState(false);
  const deferred = useDeferredValue(query);
  const hasQuery = Boolean(query.trim());
  const menus = filterDashboardMenus(deferred, bootstrap.customKeywords).slice(0, 6);
  const courses = filterDashboardCourses(bootstrap.courses, deferred).slice(0, 6);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/dashboard/global-search", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Bootstrap>;
      })
      .then(setBootstrap)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const closeOutside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
    };
  }, []);

  useEffect(() => {
    const keyword = deferred.trim();
    if (!keyword) {
      return;
    }
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks this effect's asynchronous request as pending.
    setCalendarPending(true);
    void fetch(`/api/shared-calendar/search?q=${encodeURIComponent(keyword)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ results?: CalendarSearchResult[] }>;
      })
      .then((body) => setCalendarResults(body.results ?? []))
      .catch(() => {
        if (!controller.signal.aborted) setCalendarResults([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCalendarPending(false);
      });
    return () => controller.abort();
  }, [deferred]);

  return (
    <div ref={root} className="relative w-full max-w-xl">
      <label htmlFor={inputId} className="sr-only">메뉴 또는 강사 검색</label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <Input id={inputId} type="search" className="h-9 border-slate-200 bg-slate-50 pl-9 pr-9" placeholder="강사명 또는 메뉴명 검색" value={query} autoComplete="off" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} />
        {query ? <Button type="button" variant="ghost" size="icon-sm" className="absolute top-1/2 right-1 -translate-y-1/2" aria-label="검색어 지우기" onClick={() => setQuery("")}><X /></Button> : null}
      </div>
      {open ? (
        <div className="absolute top-[calc(100%+0.5rem)] z-50 max-h-[min(32rem,calc(100dvh-5rem))] w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-500">{hasQuery ? "추천 메뉴" : "자주 찾는 메뉴"}</p>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="검색 패널 닫기" onClick={() => setOpen(false)}><X /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {menus.map((menu, index) => <Button key={menu.href} variant="outline" size="sm" className={MENU_CHIP_COLORS[index % MENU_CHIP_COLORS.length]} asChild><Link href={menu.href} onClick={() => setOpen(false)}>{menu.label}<ArrowRight className="size-3.5" /></Link></Button>)}
            </div>
          </section>
          {hasQuery && courses.length ? <section className="mt-4 border-t pt-3"><p className="mb-2 text-xs font-semibold text-slate-500">강사·강의 추천</p><div className="space-y-2">{courses.map((course) => <DropdownMenu key={course.id}><DropdownMenuTrigger asChild><button type="button" className="flex w-full items-center gap-2 rounded-lg border p-2 text-left hover:bg-slate-50"><BookOpenCheck className="size-4 shrink-0 text-blue-600" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{course.name}</span><span className="block truncate text-xs text-muted-foreground">{course.instructor} · {course.cohort} · {course.webinarDate}</span></span><Badge variant="secondary">{course.status === "ongoing" ? "진행 중" : "종료"}</Badge><ChevronDown className="size-4 shrink-0 text-slate-400" /></button></DropdownMenuTrigger><DashboardCourseOptions courseId={course.id} /></DropdownMenu>)}</div></section> : null}
          {hasQuery && (calendarPending || calendarResults.length) ? <section className="mt-4 border-t pt-3"><p className="mb-2 text-xs font-semibold text-slate-500">공용 캘린더 일정</p>{calendarPending ? <p className="text-sm text-muted-foreground">일정을 검색하는 중입니다.</p> : <div className="space-y-2">{calendarResults.slice(0, 4).map((event) => <Link key={`${event.source}:${event.id}`} href={`/calendar?date=${encodeURIComponent(event.event_date)}`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg border p-2 hover:bg-slate-50"><CalendarDays className="size-4 shrink-0 text-violet-600" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{event.title}</span><span className="block truncate text-xs text-muted-foreground">{event.event_date} · {event.time_label}</span></span></Link>)}</div>}</section> : null}
        </div>
      ) : null}
    </div>
  );
}
