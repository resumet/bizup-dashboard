"use client";

import { useId, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { scheduleRowsText, schedulesForItem, startDateTone, type WbsItemSelection } from "@/lib/course-wbs/item-schedules";
import type { WbsCourse, WbsScheduleEntry } from "@/lib/course-wbs/types";
import { webinarDateFromTimestamp, webinarDayLabel } from "@/lib/course-wbs/webinar-date";

export function WbsStartSchedule({ courses, entries, options, selected, onSelect, today, onSelectCourse }: {
  courses: WbsCourse[];
  entries: WbsScheduleEntry[];
  options: WbsItemSelection[];
  selected: WbsItemSelection | null;
  onSelect: (item: WbsItemSelection | null) => void;
  today: string;
  onSelectCourse: (id: string) => void;
}) {
  const selectId = useId();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const choices = useMemo(() => [...new Map(options.filter((item) => item.title.trim()).map((item) => [item.id, item])).values()], [options]);
  const selection = selected && choices.find((item) => item.id === selected.id);
  const rows = useMemo(() => selection ? schedulesForItem(courses, entries, selection, today) : [], [courses, entries, selection, today]);

  async function copyRows() {
    if (!selection || !rows.length || !navigator.clipboard?.writeText) {
      setCopyState("error");
      return;
    }
    try {
      await navigator.clipboard.writeText(scheduleRowsText(selection.title, rows));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return <section className="mt-7 rounded-xl border bg-background p-5 shadow-sm" aria-label="항목별 강의 시작 일정">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">항목별 강의 시작 일정</h3>
      {selection ? <Button type="button" size="sm" variant="outline" disabled={!rows.length} onClick={() => void copyRows()}>
        {copyState === "copied" ? <Check /> : <Copy />}{copyState === "copied" ? "복사됨" : "전체 복사"}
      </Button> : null}
    </div>
    <div className="mt-5 max-w-lg">
      <label htmlFor={selectId} className="mb-2 block text-sm font-medium">WBS 항목</label>
      <select id={selectId} value={selection?.id ?? ""} onChange={(event) => { setCopyState("idle"); onSelect(choices.find((item) => item.id === event.target.value) ?? null); }} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
        <option value="">시작 일정을 확인할 항목을 선택하세요</option>
        {choices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select>
    </div>
    {copyState === "error" ? <p role="alert" className="mt-3 text-sm text-destructive">목록을 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.</p> : null}
    {selection ? <div className="mt-4 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[680px] text-sm" aria-label={`${selection.title} 강의별 시작 일정`}>
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr>
          {["강의", "웨비나 날짜", "시작일", "웨비나 기준", "데드라인", "담당자", "상태"].map((title) => <th key={title} scope="col" className="px-4 py-3">{title}</th>)}
        </tr></thead>
        <tbody>{rows.length ? rows.map(({ course, hasWbs, item }) => {
          const status = !hasWbs ? "WBS 없음" : !item ? "항목 없음" : item.completed ? "완료" : !item.startDate ? "시작일 미정" : item.startDate < today ? "시작일 지남" : item.startDate === today ? "오늘 시작" : "시작 예정";
          const tone = startDateTone(item?.startDate ?? "", today);
          const webinarDate = webinarDateFromTimestamp(course.webinarAt);
          return <tr key={course.id} className={cn("border-t", tone === "overdue" && "bg-red-600 text-white", tone === "soon" && "bg-amber-200 text-amber-950 dark:bg-amber-400/80 dark:text-amber-950")}>
            <td className="px-4 py-3"><button type="button" onClick={() => onSelectCourse(course.id)} className="text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{course.name}<span className={cn("mt-1 block text-xs font-normal text-muted-foreground", tone === "overdue" && "text-white/80", tone === "soon" && "text-amber-900")}>{course.instructorName || "강사 미입력"} · {course.cohort || "기수 미입력"}</span></button></td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums">{webinarDate ? <time dateTime={webinarDate}>{webinarDate}</time> : "—"}</td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums">{item?.startDate ? <time dateTime={item.startDate}>{item.startDate}</time> : "—"}</td>
            <td className="whitespace-nowrap px-4 py-3">{webinarDayLabel(item?.startDate ?? "", webinarDate) || "—"}</td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums">{item?.dueDate || "—"}</td>
            <td className="px-4 py-3">{item?.owner || "—"}</td>
            <td className="whitespace-nowrap px-4 py-3">{status}</td>
          </tr>;
        }) : <tr className="border-t"><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">표시할 진행 중 강의가 없습니다.</td></tr>}</tbody>
      </table>
    </div> : <p className="mt-4 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">WBS 항목을 선택하면 강의별 시작일을 확인할 수 있습니다.</p>}
  </section>;
}
