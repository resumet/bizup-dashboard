"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { WbsTaskLink } from "./task-link";
import { ATTENTION_LABELS, buildWbsAttention, type AttentionCategory } from "@/lib/course-wbs/attention";
import type { WbsCourse, WbsItem, WbsScheduleEntry } from "@/lib/course-wbs/types";

export function WbsAttention({ courses, entries, today, templateItems, onSelect }: {
  courses: WbsCourse[]; entries: WbsScheduleEntry[]; today: string; templateItems: WbsItem[];
  onSelect: (courseId: string, item?: { id: string; title: string }) => void;
}) {
  const attention = useMemo(() => buildWbsAttention(courses, entries, today, templateItems), [courses, entries, today, templateItems]);
  const [filter, setFilter] = useState<AttentionCategory | "all">("all");
  const tasks = attention.tasks.filter((task) => filter === "all" || task.category === filter);
  const first = attention.tasks[0];
  return <div className="space-y-6">
    <section className="rounded-xl border bg-background p-5" aria-label="우선 처리 업무">
      <h2 className="font-semibold">가장 먼저 해결할 업무</h2>
      {first ? <div className="mt-4 space-y-2">
        <button className="text-left text-lg font-semibold text-primary hover:underline" onClick={() => onSelect(first.course.id, first.category === "missing" ? undefined : first.item)}>{first.item.title}</button>
        <p className="text-sm">{first.course.name} · {first.course.instructorName || "담당 강사 미입력"} · {first.item.owner || "담당자 미정"}</p>
        <p className="text-sm text-muted-foreground">{ATTENTION_LABELS[first.category]} · {first.reason}</p>
        <WbsTaskLink item={first.item} courseId={first.course.id} templateItems={templateItems} />
      </div> : attention.missingWbs[0] ? <div className="mt-4"><button className="font-medium text-primary hover:underline" onClick={() => onSelect(attention.missingWbs[0].id)}>{attention.missingWbs[0].name} WBS 등록</button><p className="mt-2 text-sm text-muted-foreground">업무 목록이 없어 진행 누락을 확인할 수 없습니다. 템플릿을 불러와 WBS를 저장하세요.</p></div> : <p className="mt-4 text-sm text-muted-foreground">현재 처리할 미완료 업무가 없습니다.</p>}
    </section>
    <section aria-label="업무 우선순위">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="업무 요약 필터">
        <Button size="sm" variant={filter === "all" ? "secondary" : "outline"} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>전체 {attention.tasks.length}</Button>
        {(Object.keys(ATTENTION_LABELS) as AttentionCategory[]).map((key) => <Button key={key} size="sm" variant={filter === key ? "secondary" : "outline"} aria-pressed={filter === key} onClick={() => setFilter(key)}>{ATTENTION_LABELS[key]} {attention.counts[key]}</Button>)}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">진행 중인 강의의 미완료 업무를 미진행 → 오늘 마감 → 등록 누락 → 진행 필요 → 일정 미정 → 예정 순으로 표시합니다. 같은 단계에서는 기한이 빠른 업무가 먼저입니다. 등록 누락은 템플릿 일정상 지금 필요하지만 현재 WBS에 없는 업무입니다.</p>
      <div className="overflow-x-auto rounded-xl border bg-background"><table className="w-full min-w-[900px] text-sm" aria-label="업무 요약 목록">
        <thead className="bg-muted/50 text-left"><tr>{["우선순위", "업무", "강의", "담당자", "시작일", "마감일", "확인 사유", "연결 화면"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
        <tbody>{tasks.map((task) => <tr key={`${task.course.id}-${task.item.id}`} className="border-t">
          <td className={`whitespace-nowrap px-4 py-3 ${task.category === "overdue" ? "font-semibold text-destructive" : ""}`}>{ATTENTION_LABELS[task.category]}</td>
          <td className="px-4 py-3"><button onClick={() => onSelect(task.course.id, task.category === "missing" ? undefined : task.item)} className="text-left font-medium hover:underline">{task.item.title}</button></td>
          <td className="px-4 py-3">{task.course.name}{task.course.cohort ? ` · ${task.course.cohort}기` : ""}</td>
          <td className="px-4 py-3">{task.item.owner || "담당자 미정"}</td>
          <td className="whitespace-nowrap px-4 py-3">{task.item.startDate || "—"}</td><td className="whitespace-nowrap px-4 py-3">{task.item.dueDate || "—"}</td>
          <td className="px-4 py-3">{task.reason}</td><td className="px-4 py-3"><WbsTaskLink item={task.item} courseId={task.course.id} templateItems={templateItems} /></td>
        </tr>)}{!tasks.length ? <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">해당하는 업무가 없습니다.</td></tr> : null}</tbody>
      </table></div>
    </section>
    <section className="rounded-xl border bg-background p-5" aria-label="WBS 미등록 강의">
      <h2 className="font-semibold">WBS 미등록 강의</h2>
      {attention.missingWbs.length ? <ul className="mt-4 divide-y">{attention.missingWbs.map((course) => <li key={course.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><button onClick={() => onSelect(course.id)} className="text-left font-medium text-primary hover:underline">{course.name} · {course.instructorName} {course.cohort}</button><span className="text-sm text-muted-foreground">업무를 등록해 진행 누락을 확인하세요.</span></li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">진행 중인 모든 강의에 WBS가 등록되어 있습니다.</p>}
    </section>
  </div>;
}
