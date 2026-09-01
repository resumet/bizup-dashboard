"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CourseRequiredTask } from "@/lib/course-operations/types";
import {
  formatDeadlineDate,
  TASK_DEADLINE_WEEKS,
} from "@/lib/course-operations/task-deadlines";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

type CalendarEvent = {
  date: string;
  label: string;
  eventName: string;
  detail: string;
  color: "blue" | "violet" | "amber";
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
  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function initialMonth(...dates: string[]) {
  return dates.map(parseDate).find(Boolean) ?? new Date();
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

export function CourseScheduleCalendar({
  courseName,
  freeWebinarDate,
  freeWebinarTime,
  startsDate,
  requiredTasks,
}: {
  courseName: string;
  freeWebinarDate: string;
  freeWebinarTime: string;
  startsDate: string;
  requiredTasks: CourseRequiredTask[];
}) {
  const [month, setMonth] = useState(() =>
    initialMonth(
      freeWebinarDate,
      startsDate,
      ...requiredTasks.map((task) => task.dueDate),
    ),
  );
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const days = buildMonthDays(month);
  const today = dateKey(new Date());
  const events: CalendarEvent[] = [
    ...(freeWebinarDate
      ? [{
          date: freeWebinarDate,
          label: `🎤 ${courseName} · 무료 웨비나 ${freeWebinarTime}`,
          eventName: "무료 웨비나",
          detail: `${freeWebinarTime} 시작`,
          color: "blue" as const,
        }]
      : []),
    ...(startsDate
      ? [{
          date: startsDate,
          label: `${courseName} · 개강일`,
          eventName: "개강일",
          detail: "강의 개강",
          color: "violet" as const,
        }]
      : []),
    ...requiredTasks
      .filter((task) => task.dueDate)
      .map((task) => ({
        date: task.dueDate,
        label: `${courseName} · ${task.title}`,
        eventName: task.title,
        detail: `무료 웨비나 ${TASK_DEADLINE_WEEKS[task.key]}주 전 · ${task.completed ? "작업 완료" : "진행 중"}`,
        color: "amber" as const,
        completed: task.completed,
      })),
  ];

  function moveMonth(offset: number) {
    setMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  }

  return (
    <>
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="mb-4 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="이전 달"
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft />
          </Button>
          <strong className="text-base tabular-nums">
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
                  "min-h-20 border-b border-r p-1.5",
                  !inMonth && "bg-muted/20 text-muted-foreground/50",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    key === today && "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {date.getDate()}
                </span>
                <div className="mt-1 space-y-1">
                  {dayEvents.map((event) => (
                    <button
                      type="button"
                      key={`${event.date}-${event.label}`}
                      title={event.label}
                      onClick={() => setSelectedEvent(event)}
                      className={cn(
                        "block w-full truncate rounded px-1.5 py-1 text-left text-sm font-medium leading-5 transition-opacity hover:opacity-80",
                        event.color === "blue" && "bg-blue-100 text-blue-800",
                        event.color === "violet" &&
                          "bg-violet-100 text-violet-800",
                        event.color === "amber" && "bg-amber-100 text-amber-900",
                        event.completed && "line-through opacity-60",
                      )}
                    >
                      {event.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>
            <i className="mr-1.5 inline-block size-2 rounded-full bg-blue-500" />
            무료 웨비나
          </span>
          <span>
            <i className="mr-1.5 inline-block size-2 rounded-full bg-violet-500" />
            개강일
          </span>
          <span>
            <i className="mr-1.5 inline-block size-2 rounded-full bg-amber-500" />
            필수 작업
          </span>
        </div>
      </div>
    </div>
    <Dialog
      open={Boolean(selectedEvent)}
      onOpenChange={(open) => {
        if (!open) setSelectedEvent(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{selectedEvent?.eventName}</DialogTitle>
          <DialogDescription>{courseName}</DialogDescription>
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
      </DialogContent>
    </Dialog>
    </>
  );
}
