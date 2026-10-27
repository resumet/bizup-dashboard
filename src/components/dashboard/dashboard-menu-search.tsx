"use client";

import Link from "next/link";
import { useDeferredValue, useId, useState } from "react";
import { ArrowRight, BookOpenCheck, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filterDashboardCourses, filterDashboardMenus, type DashboardCourseSearchItem } from "@/lib/dashboard/menu-search";
import { getDashboardCourseDestinations } from "@/lib/work/instructor-course-search";

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

export function DashboardMenuSearch({ courses }: { courses: DashboardCourseSearchItem[] }) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const menus = filterDashboardMenus(deferredQuery).slice(0, 8);
  const courseResults = filterDashboardCourses(courses, deferredQuery).slice(0, 4);
  const hasQuery = query.trim().length > 0;

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
          onChange={(event) => setQuery(event.target.value)}
          placeholder="강사명 또는 메뉴명을 검색하세요"
          autoComplete="off"
        />
        {query ? <Button type="button" variant="ghost" size="icon-sm" className="absolute top-1/2 right-2 -translate-y-1/2" aria-label="검색어 지우기" onClick={() => setQuery("")}><X /></Button> : null}
      </div>

      <div className="mt-4" aria-live="polite">
        <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">{hasQuery ? "추천 메뉴" : "자주 찾는 메뉴"}</p>
        {menus.length ? <div className="flex flex-wrap gap-2">
          {menus.map((menu, index) => <Button key={menu.href} variant="outline" size="sm" className={`h-auto min-h-9 ${MENU_CHIP_COLORS[index % MENU_CHIP_COLORS.length]}`} asChild>
            <Link href={menu.href}><span>{menu.label}</span><ArrowRight className="size-3.5 opacity-60" /></Link>
          </Button>)}
        </div> : <p className="text-sm text-muted-foreground">일치하는 메뉴가 없습니다.</p>}
      </div>

      {hasQuery && courseResults.length ? <div className="mt-5 border-t pt-4">
        <p className="mb-3 text-xs font-semibold tracking-wide text-slate-500">강사·강의 추천</p>
        <div className="grid gap-3 xl:grid-cols-2">
          {courseResults.map((course) => <article key={course.id} className="rounded-xl border border-slate-200 p-3.5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><BookOpenCheck className="size-4" aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{course.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{course.instructor || "강사 미정"} · {course.cohort || "기수 미정"} · {course.webinarDate}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {getDashboardCourseDestinations(course.id).map((destination) => <Button key={destination.href} variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
                <Link href={destination.href}>{destination.label}</Link>
              </Button>)}
            </div>
          </article>)}
        </div>
      </div> : hasQuery && !menus.length ? <p className="mt-4 text-sm text-muted-foreground">‘{query.trim()}’에 맞는 강사나 강의를 찾지 못했습니다.</p> : null}
    </section>
  );
}
