"use client";

import Link from "next/link";
import { useDeferredValue, useId, useState } from "react";
import {
  ArrowRight,
  BookOpenText,
  ClipboardList,
  Search,
  UsersRound,
  Video,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  filterCoursesByInstructor,
  getCourseDestinations,
  getOngoingInstructorNames,
  type InstructorCourseSearchItem,
} from "@/lib/work/instructor-course-search";

type InstructorCourseSearchProps = {
  courses: InstructorCourseSearchItem[];
  loadError?: string;
};

const destinationIcons = [BookOpenText, Video, UsersRound, ClipboardList];

const instructorColorClasses = [
  "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-950",
  "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-300 dark:hover:bg-violet-950",
  "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950",
  "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-950",
  "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950",
  "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:border-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-300 dark:hover:bg-cyan-950",
] as const;

function formatCohort(cohort: string) {
  const value = cohort.trim();
  if (!value) return "기수 미입력";
  return value.endsWith("기") ? value : `${value}기`;
}

export function InstructorCourseSearch({
  courses,
  loadError,
}: InstructorCourseSearchProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const results = filterCoursesByInstructor(courses, deferredQuery);
  const ongoingInstructorNames = getOngoingInstructorNames(courses);
  const hasQuery = query.trim().length > 0;

  return (
    <section aria-label="강사별 강의 찾기">
      <h2 className="mb-4 text-xl font-semibold tracking-tight">
        <label htmlFor={inputId}>강사 검색</label>
      </h2>
      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="relative">
          <Search className="absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-12 bg-background pr-12 pl-11 text-base md:text-base"
            placeholder="강사명을 입력하세요 (예: 김해준)"
            autoComplete="off"
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-2 -translate-y-1/2"
              aria-label="검색어 지우기"
              onClick={() => setQuery("")}
            >
              <X />
            </Button>
          ) : null}
        </div>

        {ongoingInstructorNames.length ? (
          <div
            className="mt-3 flex flex-wrap items-center gap-1.5"
            aria-label="현재 진행 중인 강사"
          >
            {ongoingInstructorNames.map((name, index) => (
              <button
                key={name}
                type="button"
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${instructorColorClasses[index % instructorColorClasses.length]}`}
                onClick={() => setQuery(name)}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}

        {loadError ? (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {loadError}
          </p>
        ) : !courses.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            검색할 수 있는 강의가 없습니다.
          </p>
        ) : hasQuery && results.length ? (
          <div className="mt-5 space-y-3" aria-live="polite">
            <p className="text-sm font-medium text-muted-foreground">
              {results.length}개의 강의를 찾았습니다.
            </p>
            <div className="grid gap-4 xl:grid-cols-2">
              {results.map((course) => (
                <article
                  key={course.id}
                  className="rounded-xl border bg-background p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="text-lg font-semibold tracking-tight">
                      {course.name}
                    </h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {course.statusLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {course.instructorName} · {formatCohort(course.cohort)} ·
                    무료강의 {course.webinarDate}
                  </p>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {getCourseDestinations(course.id).map(
                      (destination, index) => {
                        const Icon = destinationIcons[index];
                        return (
                          <Button
                            key={destination.href}
                            variant="outline"
                            className="h-auto min-h-11 justify-start whitespace-normal px-3 py-2.5 text-left"
                            asChild
                          >
                            <Link href={destination.href}>
                              <Icon className="size-4 text-muted-foreground" />
                              <span>{destination.label}</span>
                              <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                            </Link>
                          </Button>
                        );
                      },
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : hasQuery ? (
          <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
            ‘{query.trim()}’ 강사의 강의를 찾지 못했습니다.
          </p>
        ) : null}
      </div>
    </section>
  );
}
