"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CourseSummary } from "@/lib/course-operations/types";
import { toKoreaDate, toKoreaTime } from "@/lib/course-operations/schedule";
import {
  formatDeadlineDate,
  TASK_DEADLINE_WEEKS,
} from "@/lib/course-operations/task-deadlines";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
const COURSE_COLORS = [
  {
    event: "bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-100",
    dot: "bg-blue-500",
  },
  {
    event: "bg-violet-100 text-violet-900 hover:bg-violet-200 dark:bg-violet-950 dark:text-violet-100",
    dot: "bg-violet-500",
  },
  {
    event: "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-100",
    dot: "bg-emerald-500",
  },
  {
    event: "bg-amber-100 text-amber-950 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  {
    event: "bg-rose-100 text-rose-900 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-100",
    dot: "bg-rose-500",
  },
  {
    event: "bg-cyan-100 text-cyan-950 hover:bg-cyan-200 dark:bg-cyan-950 dark:text-cyan-100",
    dot: "bg-cyan-500",
  },
  {
    event: "bg-orange-100 text-orange-950 hover:bg-orange-200 dark:bg-orange-950 dark:text-orange-100",
    dot: "bg-orange-500",
  },
  {
    event: "bg-fuchsia-100 text-fuchsia-900 hover:bg-fuchsia-200 dark:bg-fuchsia-950 dark:text-fuchsia-100",
    dot: "bg-fuchsia-500",
  },
] as const;

type CourseCalendarEvent = {
  id: string;
  courseId: string;
  courseName: string;
  instructorName: string;
  date: string;
  label: string;
  eventName: string;
  detail: string;
  colorIndex: number;
  completed?: boolean;
};

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function buildMonthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function buildEvents(courses: CourseSummary[]) {
  return courses.flatMap<CourseCalendarEvent>((course, colorIndex) => {
    const webinarDate = toKoreaDate(course.free_webinar_at);
    const startsDate = toKoreaDate(course.starts_at);
    return [
      {
        id: `${course.id}-webinar`,
        courseId: course.id,
        courseName: course.name,
        instructorName: course.instructor_name,
        date: webinarDate,
        label: `🎤 ${course.name} · 무료 웨비나 ${toKoreaTime(course.free_webinar_at)}`,
        eventName: "무료 웨비나",
        detail: `${toKoreaTime(course.free_webinar_at)} 시작`,
        colorIndex,
      },
      {
        id: `${course.id}-starts`,
        courseId: course.id,
        courseName: course.name,
        instructorName: course.instructor_name,
        date: startsDate,
        label: `${course.name} · 개강일`,
        eventName: "개강일",
        detail: "강의 개강",
        colorIndex,
      },
      ...course.required_tasks
        .filter((task) => task.dueDate)
        .map((task) => ({
          id: `${course.id}-${task.key}`,
          courseId: course.id,
          courseName: course.name,
          instructorName: course.instructor_name,
          date: task.dueDate,
          label: `${course.name} · ${task.title}`,
          eventName: task.title,
          detail: `무료 웨비나 ${TASK_DEADLINE_WEEKS[task.key]}주 전 · ${task.completed ? "작업 완료" : "진행 중"}`,
          colorIndex,
          completed: task.completed,
        })),
    ];
  });
}

function getInitialMonth(events: CourseCalendarEvent[]) {
  const today = new Date();
  if (events.some((event) => event.date === dateKey(today))) return today;
  const datedEvents = events
    .map((event) => parseDate(event.date))
    .filter((date): date is Date => Boolean(date));
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const upcoming = datedEvents
    .filter((date) => date >= todayStart)
    .toSorted((a, b) => a.getTime() - b.getTime());
  if (upcoming[0]) return upcoming[0];
  const latestPast = datedEvents.toSorted(
    (a, b) => b.getTime() - a.getTime(),
  )[0];
  return latestPast ?? today;
}

export function CourseListCalendar({ courses }: { courses: CourseSummary[] }) {
  const events = buildEvents(courses);
  const [month, setMonth] = useState(() => getInitialMonth(events));
  const [selectedEvent, setSelectedEvent] =
    useState<CourseCalendarEvent | null>(null);
  const days = buildMonthDays(month);
  const today = dateKey(new Date());

  function moveMonth(offset: number) {
    setMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <CardTitle>전체 강의 일정</CardTitle>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="이전 달"
              onClick={() => moveMonth(-1)}
            >
              <ChevronLeft />
            </Button>
            <strong className="min-w-28 text-center text-base tabular-nums">
              {month.getFullYear()}년 {month.getMonth() + 1}월
            </strong>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="다음 달"
              onClick={() => moveMonth(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {courses.map((course, index) => (
            <span key={course.id} className="flex items-center gap-1.5 text-xs">
              <i
                className={cn(
                  "inline-block size-2.5 rounded-full",
                  COURSE_COLORS[index % COURSE_COLORS.length].dot,
                )}
              />
              {course.name}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-7 border-l border-t">
            {WEEKDAYS.map((weekday, index) => (
              <div
                key={weekday}
                className={cn(
                  "border-b border-r bg-muted/40 py-2 text-center text-xs font-medium",
                  index === 5 && "text-blue-600",
                  index === 6 && "text-red-600",
                )}
              >
                {weekday}
              </div>
            ))}
            {days.map((date) => {
              const key = dateKey(date);
              const dayEvents = events.filter((event) => event.date === key);
              const inMonth = date.getMonth() === month.getMonth();
              return (
                <div
                  key={key}
                  className={cn(
                    "min-h-32 border-b border-r p-2",
                    !inMonth && "bg-muted/20 text-muted-foreground/50",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      key === today &&
                        "bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayEvents.map((event) => {
                      const color =
                        COURSE_COLORS[event.colorIndex % COURSE_COLORS.length];
                      return (
                        <button
                          type="button"
                          key={event.id}
                          title={event.label}
                          onClick={() => setSelectedEvent(event)}
                          className={cn(
                            "block w-full rounded px-2 py-1.5 text-left text-sm font-medium leading-5 transition-colors",
                            color.event,
                            event.completed && "line-through opacity-60",
                          )}
                        >
                          {event.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
    <Dialog
      open={Boolean(selectedEvent)}
      onOpenChange={(open) => {
        if (!open) setSelectedEvent(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{selectedEvent?.eventName}</DialogTitle>
          <DialogDescription>
            {selectedEvent?.courseName} · {selectedEvent?.instructorName}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid gap-3 rounded-lg border bg-muted/20 p-4">
          <div className="grid grid-cols-[70px_1fr] gap-3">
            <dt className="text-muted-foreground">일정</dt>
            <dd className="font-medium tabular-nums">
              {formatDeadlineDate(selectedEvent?.date ?? "")}
            </dd>
          </div>
          <div className="grid grid-cols-[70px_1fr] gap-3">
            <dt className="text-muted-foreground">상세</dt>
            <dd className="font-medium">{selectedEvent?.detail}</dd>
          </div>
        </dl>
        <DialogFooter>
          {selectedEvent ? (
            <Button asChild>
              <Link href={`/services/course-operations/${selectedEvent.courseId}`}>
                강의 상세보기
              </Link>
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
