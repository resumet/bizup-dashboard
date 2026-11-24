"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthDays, shiftMonth } from "@/lib/shared-calendar/calendar";
import type { WbsScheduleEntry } from "@/lib/course-wbs/types";

export function WbsCalendar({ entries, today, initialDate = today, courseLabels, onOpenTask }: {
  entries: WbsScheduleEntry[];
  today: string;
  initialDate?: string;
  courseLabels?: Map<string, string>;
  onOpenTask: (courseId: string, itemId: string) => void;
}) {
  const [selected, setSelected] = useState(initialDate);
  const month = selected.slice(0, 7);
  const dates = monthDays(month);
  const tasks = entries.flatMap(({ courseId, items }) => items.map(item => ({ courseId, item })));
  const daily = dates.map(date => tasks.filter(({ item }) => {
    const start = item.startDate || item.dueDate;
    const end = item.dueDate || item.startDate;
    return start && start <= date && date <= end;
  }));
  const agenda = daily[dates.indexOf(selected)];
  const changeMonth = (offset: number) => setSelected(shiftMonth(month, offset) + "-01");

  return <section aria-label="할 일 달력" className="overflow-hidden rounded-xl border bg-background">
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-5">
      <h2 className="font-semibold" aria-live="polite">{month.slice(0, 4)}년 {Number(month.slice(5))}월</h2>
      <div className="flex items-center gap-1">
        <Button type="button" size="icon-sm" variant="ghost" aria-label="이전 달" onClick={() => changeMonth(-1)}><ChevronLeft /></Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setSelected(today)}>오늘</Button>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="다음 달" onClick={() => changeMonth(1)}><ChevronRight /></Button>
      </div>
    </div>
    <div className="grid grid-cols-7 border-t bg-muted/40 text-center text-xs text-muted-foreground">
      {["일", "월", "화", "수", "목", "금", "토"].map(day => <span className="py-2" key={day}>{day}</span>)}
    </div>
    <div className="grid grid-cols-7">
      {dates.map((date, index) => {
        const active = date === selected;
        const events = daily[index];
        return <button key={date} type="button" onClick={() => setSelected(date)}
          aria-label={`${date} · 할 일 ${events.length}개`} aria-pressed={active} aria-current={date === today ? "date" : undefined}
          className={`flex min-h-16 min-w-0 flex-col items-start gap-1 border-t p-1.5 text-left text-xs sm:min-h-24 sm:p-2 [&:not(:nth-child(7n))]:border-r focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? "bg-primary/5 ring-2 ring-inset ring-primary" : "hover:bg-muted/50"} ${date.startsWith(month) ? "" : "text-muted-foreground bg-muted/30"}`}>
          <span className={date === today ? "rounded-full bg-primary px-1.5 font-semibold text-primary-foreground" : "px-1 font-medium"}>{Number(date.slice(-2))}</span>
          {events.slice(0, 2).map(({ courseId, item }) => <span key={courseId + ":" + item.id} className={`hidden w-full truncate rounded px-1.5 py-0.5 sm:block ${item.completed ? "bg-muted text-muted-foreground line-through" : "bg-primary/10 text-foreground"}`}>{item.title}</span>)}
          {events.length > 2 && <span className="hidden px-1 text-muted-foreground sm:block">+{events.length - 2}개</span>}
          {events.length > 0 && <span className="px-1 text-primary sm:hidden">{events.length}개</span>}
        </button>;
      })}
    </div>
    <div className="border-t px-3 py-4 sm:px-5">
      <h3 className="mb-2 font-semibold">{Number(selected.slice(5, 7))}월 {Number(selected.slice(-2))}일 할 일 · {agenda.length}개</h3>
      {agenda.length ? <ul className="divide-y">{agenda.map(({ courseId, item }) => <li key={courseId + ":" + item.id}>
        <button type="button" className="block w-full rounded px-1 py-2 text-left hover:bg-muted/50" onClick={() => onOpenTask(courseId, item.id)}>
          <span className={item.completed ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{item.title}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{[courseLabels?.get(courseId), item.owner, item.startDate && `시작 ${item.startDate}`, item.dueDate && `마감 ${item.dueDate}`, item.completed && "완료"].filter(Boolean).join(" · ")}</span>
        </button>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">이 날짜에 예정된 할 일이 없습니다.</p>}
    </div>
  </section>;
}
