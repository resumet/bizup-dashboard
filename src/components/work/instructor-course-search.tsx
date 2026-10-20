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
  type InstructorCourseSearchItem,
} from "@/lib/work/instructor-course-search";

type InstructorCourseSearchProps = {
  courses: InstructorCourseSearchItem[];
  loadError?: string;
};

const destinationIcons = [BookOpenText, Video, UsersRound, ClipboardList];

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
  const hasQuery = query.trim().length > 0;

  return (
    <section
      className="mt-7 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"
      aria-label="강사별 강의 찾기"
    >
      <label className="mb-2 block text-sm font-semibold" htmlFor={inputId}>
        강사 검색
      </label>
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

      {loadError ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : !courses.length ? (
        <p className="mt-3 text-sm text-muted-foreground">
          검색할 수 있는 강의가 없습니다.
        </p>
      ) : !hasQuery ? (
        <p className="mt-3 text-sm text-muted-foreground">
          강사명을 입력하면 연결된 강의와 업무 화면을 찾을 수 있습니다.
        </p>
      ) : results.length ? (
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
                  <h2 className="text-lg font-semibold tracking-tight">
                    {course.name}
                  </h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {course.statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {course.instructorName} · {formatCohort(course.cohort)} ·
                  무료강의 {course.webinarDate}
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {getCourseDestinations(course.id).map((destination, index) => {
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
                  })}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">
          ‘{query.trim()}’ 강사의 강의를 찾지 못했습니다.
        </p>
      )}
    </section>
  );
}
