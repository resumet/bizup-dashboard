"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export type GanttItem = {
  id: string;
  title: string;
  owner: string;
  startDate: string;
  dueDate: string;
  completed: boolean;
  position: number;
};

const DAY = 24 * 60 * 60 * 1000;
const WEEK_WIDTH = 112;
const DAY_WIDTH = WEEK_WIDTH / 7;
const VISIBLE_WEEKS = 16;
const dateLabel = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "UTC" });
const fullDateLabel = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });

function dateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const result = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(result) ? null : result;
}

function monday(value: number) {
  const day = new Date(value).getUTCDay();
  return value - ((day + 6) % 7) * DAY;
}

export function WbsGantt({ items }: { items: GanttItem[] }) {
  const [chosenStart, setChosenStart] = useState<number | null>(null);
  const dated = useMemo(() => {
    const dated = items.map((item) => ({
      item,
      start: dateValue(item.startDate || item.dueDate),
      end: dateValue(item.dueDate || item.startDate),
    })).filter((entry) => entry.start !== null && entry.end !== null);
    return dated;
  }, [items]);
  const first = dated.length ? Math.min(...dated.map((entry) => Math.min(entry.start!, entry.end!))) : null;
  const autoStart = first === null ? null : monday(first) - 7 * DAY;
  const timeline = autoStart === null ? null : {
    start: chosenStart ?? autoStart,
    weeks: VISIBLE_WEEKS,
    width: VISIBLE_WEEKS * WEEK_WIDTH,
  };

  if (!items.length) {
    return <div className="rounded-xl border border-dashed bg-background px-6 py-16 text-center text-sm text-muted-foreground">항목을 추가하면 일정이 여기에 표시됩니다.</div>;
  }
  if (!timeline) {
    return <div className="rounded-xl border border-dashed bg-background px-6 py-16 text-center text-sm text-muted-foreground">간트 차트를 보려면 목록에서 시작일 또는 데드라인을 입력하세요.</div>;
  }

  const currentDate = new Date();
  const localToday = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;
  const now = dateValue(localToday);
  const todayOffset = now === null ? -1 : ((now - timeline.start) / DAY) * DAY_WIDTH;
  const sorted = [...items].sort((a, b) => a.position - b.position);
  const lastVisible = timeline.start + VISIBLE_WEEKS * 7 * DAY - DAY;
  const outsideCount = dated.filter((entry) => entry.end! < timeline.start || entry.start! > lastVisible).length;

  function shiftWeeks(weeks: number) {
    setChosenStart((current) => (current ?? autoStart!) + weeks * 7 * DAY);
  }

  function chooseMonth(value: string) {
    const selected = dateValue(`${value}-01`);
    if (selected !== null) setChosenStart(monday(selected) - 7 * DAY);
  }

  return (
    <div className="rounded-xl border bg-background" aria-label="WBS 간트 차트">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-xs text-muted-foreground">
        <span>{fullDateLabel.format(new Date(timeline.start))} ~ {fullDateLabel.format(new Date(lastVisible))}{outsideCount ? ` · 표시 기간 밖 ${outsideCount}개` : ""}</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setChosenStart(null)}>첫 일정</Button>
          <input type="month" value={new Date(timeline.start + 7 * DAY).toISOString().slice(0, 7)} onChange={(event) => chooseMonth(event.target.value)} aria-label="간트 차트 표시 월" className="h-9 rounded-lg border border-input bg-background px-2 text-xs" />
          <Button size="icon" variant="outline" onClick={() => shiftWeeks(-8)} aria-label="이전 8주"><ChevronLeft /></Button>
          <Button size="icon" variant="outline" onClick={() => shiftWeeks(8)} aria-label="다음 8주"><ChevronRight /></Button>
        </div>
      </div>
      <div className="overflow-x-auto">
      <div className="relative" style={{ width: timeline.width + 256 }}>
        <div className="flex h-12 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          <div className="sticky left-0 z-20 flex w-64 shrink-0 items-center border-r bg-muted px-4">업무 · 담당자</div>
          <div className="relative flex" style={{ width: timeline.width }}>
            {Array.from({ length: timeline.weeks }, (_, index) => {
              const weekStart = new Date(timeline.start + index * 7 * DAY);
              return <div key={index} className="flex shrink-0 items-center border-r px-2" style={{ width: WEEK_WIDTH }}>
                {dateLabel.format(weekStart)} 주
              </div>;
            })}
          </div>
        </div>
        {sorted.map((item) => {
          const start = dateValue(item.startDate || item.dueDate);
          const end = dateValue(item.dueDate || item.startDate);
          const rawLeft = start === null || end === null ? 0 : (Math.min(start, end) - timeline.start) / DAY * DAY_WIDTH;
          const rawRight = start === null || end === null ? 0 : (Math.max(start, end) - timeline.start) / DAY * DAY_WIDTH + DAY_WIDTH;
          const visible = start !== null && end !== null && rawRight > 0 && rawLeft < timeline.width;
          const left = Math.max(0, rawLeft);
          const width = Math.max(0, Math.min(timeline.width, rawRight) - left);
          return <div key={item.id} className="flex h-14 border-b last:border-b-0">
            <div className="sticky left-0 z-10 flex w-64 shrink-0 flex-col justify-center border-r bg-background px-4">
              <span className={`truncate text-sm font-medium ${item.completed ? "text-muted-foreground line-through" : ""}`} title={item.title}>{item.title || "제목 없음"}</span>
              <span className="truncate text-xs text-muted-foreground">{item.owner || "담당자 미정"}</span>
            </div>
            <div className="relative h-full" style={{ width: timeline.width, backgroundImage: `linear-gradient(to right, var(--border) 1px, transparent 1px)`, backgroundSize: `${WEEK_WIDTH}px 100%` }}>
              {todayOffset >= 0 && todayOffset <= timeline.width ? <div className="absolute inset-y-0 z-10 w-px bg-rose-500/70" style={{ left: todayOffset }} title="오늘" /> : null}
              {visible ? <div
                className={`absolute top-4 flex h-6 items-center overflow-hidden rounded-md px-2 text-[11px] font-medium whitespace-nowrap ${item.completed ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"}`}
                style={{ left, width }}
                title={`${item.title}: ${item.startDate || item.dueDate} ~ ${item.dueDate || item.startDate}${item.completed ? " (완료)" : ""}`}
              >{width > 65 ? item.title : ""}</div> : <span className="absolute left-4 top-5 text-xs text-muted-foreground">{start !== null && end !== null ? "표시 기간 밖" : "일정 미정"}</span>}
            </div>
          </div>;
        })}
      </div>
      </div>
    </div>
  );
}
