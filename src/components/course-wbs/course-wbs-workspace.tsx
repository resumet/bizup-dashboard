"use client";

import { COURSE_STATUS_LABELS, isSelectableCourse } from "@/lib/course-operations/course-status";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ArrowDown, ArrowUp, CalendarDays, ChevronDown, ClipboardList, ExternalLink, GripVertical,
  LoaderCircle, MoreHorizontal, Plus, Save, Trash2,
} from "lucide-react";

import { WbsGantt } from "@/components/course-wbs/wbs-gantt";
import { WbsAttention } from "./wbs-attention";
import { WbsTaskLink } from "./task-link";
import { wbsProgress } from "@/lib/course-wbs/attention";
import { WbsStartSchedule } from "@/components/course-wbs/wbs-start-schedule";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toKoreaDate, toKoreaTime } from "@/lib/course-operations/schedule";
import { reorderWbsItems } from "@/lib/course-wbs/reorder";
import { selectablePeople } from "@/lib/course-wbs/people";
import { datesForStartOffset, dueDateForOffset, dueDateForStartDate, WBS_DUE_OFFSETS, WBS_START_OFFSETS } from "@/lib/course-wbs/schedule-options";
import { sortWbsItemsByStartDate } from "@/lib/course-wbs/start-date-sort";
import { mergeTemplateItems } from "@/lib/course-wbs/template-items";
import type { WbsItemSelection } from "@/lib/course-wbs/item-schedules";
import type { CourseWbs, CourseWbsBootstrap, WbsCourse, WbsDashboard, WbsDashboardTask, WbsItem, WbsScheduleEntry, WbsSummary, WbsTemplate } from "@/lib/course-wbs/types";
import { syncWebinarItem, webinarDateFromTimestamp, webinarDayLabel, WEBINAR_ITEM_ID } from "@/lib/course-wbs/webinar-date";

type WbsResponse = { wbs: CourseWbs | null; webinarAt: string | null };

const EMPTY_DASHBOARD: WbsDashboard = {
  savedWbsCount: 0,
  totalItemCount: 0,
  completedItemCount: 0,
  overdueTasks: [],
  upcomingTasks: [],
  closestUnstartedCourseId: null,
};

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function emptyItem(position: number): WbsItem {
  return {
    id: crypto.randomUUID(), title: "", owner: "", stakeholders: "", startDate: "",
    dueDate: "", description: "", completed: false, position,
  };
}

function ordered(items: WbsItem[]) {
  return [...items].sort((a, b) => a.position - b.position).map((item, position) => ({ ...item, position }));
}

function courseLabel(course: WbsCourse) {
  const cohort = course.cohort.trim();
  return [course.instructorName || "강사 미입력", course.name, cohort ? `${cohort}${cohort.endsWith("기") ? "" : "기"}` : ""].filter(Boolean).join(" · ");
}

function courseCohort(course: WbsCourse) {
  const cohort = course.cohort.trim();
  return cohort ? `${cohort}${cohort.endsWith("기") ? "" : "기"}` : "기수 미입력";
}

function courseWbsHeading(course: WbsCourse | undefined) {
  if (!course) return "강의 정보 확인 중";
  const webinarDate = course.webinarAt ? toKoreaDate(course.webinarAt) : "";
  const webinarTime = course.webinarAt ? toKoreaTime(course.webinarAt) : "";
  return [
    course.instructorName.trim() || "강사 미입력",
    courseCohort(course),
    course.name,
    webinarDate || "무료 웨비나 날짜 미입력",
    webinarTime || "시간 미입력",
  ].join(" • ");
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function remainingDayLabel(target: string, today: string) {
  const days = daysBetween(today, target);
  return days === 0 ? "D-day" : days > 0 ? `D-${days}` : `${Math.abs(days)}일 지남`;
}

function taskScheduleLabel(scheduledDate: string, today: string) {
  if (!scheduledDate) return "일정 미정";
  const days = daysBetween(today, scheduledDate);
  if (days === 0) return "오늘까지";
  if (days < 0) return `${Math.abs(days)}일 지연`;
  return `${days}일 남음`;
}

function taskDateLabel(task: WbsDashboardTask) {
  return task.dueDate ? `마감 ${task.dueDate}` : `시작 ${task.startDate}`;
}

function DashboardTaskList({ title, description, emptyMessage, tasks, coursesById, today, onSelectCourse, delayed }: {
  title: string;
  description: string;
  emptyMessage: string;
  tasks: WbsDashboardTask[];
  coursesById: Map<string, WbsCourse>;
  today: string;
  onSelectCourse: (courseId: string) => void;
  delayed: boolean;
}) {
  return <section className={`rounded-xl border bg-background p-5 shadow-sm ${delayed ? "border-red-200 dark:border-red-900" : "border-amber-200 dark:border-amber-900"}`}>
    <div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{title}</h4><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><Badge variant="outline" className={delayed ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-300" : "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300"}>{tasks.length}개</Badge></div>
    {tasks.length ? <ol className="mt-4 divide-y rounded-lg border">{tasks.map((task) => {
      const linkedCourse = coursesById.get(task.courseId);
      return <li key={`${task.courseId}-${task.itemId}`}><button type="button" onClick={() => onSelectCourse(task.courseId)} className="block w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{task.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{linkedCourse ? courseLabel(linkedCourse) : "연결된 강의 없음"}{task.owner ? ` · 담당 ${task.owner}` : " · 담당 미정"}</p></div><span className={delayed ? "shrink-0 text-xs font-semibold text-destructive" : "shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300"}>{taskScheduleLabel(task.scheduledDate, today)}</span></div>
        <p className="mt-1 text-xs text-muted-foreground">{taskDateLabel(task)}</p>
      </button></li>;
    })}</ol> : <p className="mt-4 rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>}
  </section>;
}

function withSavedPeople(people: string[], items: WbsItem[]) {
  return [...new Set([...people, ...items.flatMap((item) => [item.owner.trim(), item.stakeholders.trim()]).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b, "ko"));
}

function selectedStartOffset(item: WbsItem, webinarDate: string) {
  if (!item.startDate) return "none";
  const choice = WBS_START_OFFSETS.find((option) => {
    const dates = datesForStartOffset(webinarDate, option.daysBefore);
    return dates?.startDate === item.startDate;
  });
  return choice ? String(choice.daysBefore) : "custom";
}

function selectedDueOffset(item: WbsItem) {
  if (!item.dueDate) return "none";
  const choice = WBS_DUE_OFFSETS.find((option) => dueDateForOffset(item.startDate, option.daysAfter) === item.dueDate);
  return choice ? String(choice.daysAfter) : "custom";
}

function isPastItem(item: WbsItem, today: string) {
  const scheduled = item.dueDate || item.startDate;
  return Boolean(scheduled) && scheduled < today;
}

function PeoplePicker({ value, people, disabled, label, onChange }: {
  value: string;
  people: string[];
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
}) {
  return <div className="relative">
    <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={`${label} 입력 또는 선택`} aria-label={label} className="pr-10" disabled={disabled} />
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon-xs" variant="ghost" aria-label={`${label} 목록 열기`} disabled={disabled} className="absolute right-1 top-1">
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 w-56 overflow-y-auto">
        {people.length ? people.map((name) => <DropdownMenuItem key={name} onSelect={() => onChange(name)}>{name}</DropdownMenuItem>) : (
          <DropdownMenuItem disabled>저장된 이름이 없습니다. 직접 입력하세요.</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { error?: string; message?: string }) | null;
  if (!response.ok) throw new ApiError(body?.error || body?.message || `요청이 실패했습니다. (${response.status})`, response.status);
  return body as T;
}

function dateIsValid(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function validateItems(items: WbsItem[]) {
  for (const [index, item] of items.entries()) {
    if (!item.title.trim()) return `${index + 1}번째 항목의 제목을 입력해 주세요.`;
    if (item.startDate && !dateIsValid(item.startDate)) return `${index + 1}번째 항목의 시작일을 확인해 주세요.`;
    if (item.dueDate && !dateIsValid(item.dueDate)) return `${index + 1}번째 항목의 데드라인을 확인해 주세요.`;
    if (item.startDate && item.dueDate && item.startDate > item.dueDate) return `${index + 1}번째 항목의 데드라인은 시작일 이후여야 합니다.`;
  }
  return "";
}

export function CourseWbsWorkspace({ initialCourseId }: { initialCourseId: string }) {
  const [courses, setCourses] = useState<WbsCourse[]>([]);
  const [wbsSummaries, setWbsSummaries] = useState<WbsSummary[]>([]);
  const [schedules, setSchedules] = useState<WbsScheduleEntry[]>([]);
  const [selectedScheduleItem, setSelectedScheduleItem] = useState<WbsItemSelection | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WbsCourse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [dashboard, setDashboard] = useState<WbsDashboard>(EMPTY_DASHBOARD);
  const [overviewTab, setOverviewTab] = useState<"manage" | "analysis" | "summary">("manage");
  const [newCourseId, setNewCourseId] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);
  const [inactivePeople, setInactivePeople] = useState<string[]>([]);
  const [template, setTemplate] = useState<WbsTemplate | null>(null);
  const [courseId, setCourseId] = useState("");
  const [items, setItems] = useState<WbsItem[]>([]);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [hasWbs, setHasWbs] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [view, setView] = useState<"list" | "compact" | "gantt">("list");
  const [loading, setLoading] = useState(true);
  const [loadingWbs, setLoadingWbs] = useState(false);
  const [courseReady, setCourseReady] = useState(false);
  const [overviewFailed, setOverviewFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflictTarget, setConflictTarget] = useState<"wbs" | null>(null);
  const [today, setToday] = useState(() => toKoreaDate(new Date().toISOString()));
  const loadSequence = useRef(0);
  const addedItemId = useRef<string | null>(null);
  const titleInputs = useRef(new Map<string, HTMLInputElement>());

  const loadCourse = useCallback(async (id: string) => {
    const sequence = ++loadSequence.current;
    setLoadingWbs(true);
    setCourseReady(false);
    setError("");
    setNotice("");
    setConflictTarget(null);
    try {
      const response = await fetch(`/api/course-wbs/${encodeURIComponent(id)}`, { cache: "no-store" });
      const body = await responseJson<WbsResponse>(response);
      if (sequence !== loadSequence.current) return;
      const storedItems = ordered(body.wbs?.items ?? []);
      const linkedItems = ordered(syncWebinarItem(storedItems, webinarDateFromTimestamp(body.webinarAt)));
      setCourses((current) => current.map((entry) => entry.id === id ? { ...entry, webinarAt: body.webinarAt } : entry));
      setItems(linkedItems);
      setHasWbs(Boolean(body.wbs));
      setUpdatedAt(body.wbs?.updatedAt ?? "");
      setDirty(Boolean(body.wbs) && JSON.stringify(storedItems) !== JSON.stringify(linkedItems));
      setCourseReady(true);
    } catch (caught) {
      if (sequence === loadSequence.current) {
        setCourseReady(false);
        setError(caught instanceof Error ? caught.message : "WBS를 불러오지 못했습니다.");
      }
    } finally {
      if (sequence === loadSequence.current) setLoadingWbs(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadOverview() {
      try {
        const response = await fetch("/api/course-wbs", { cache: "no-store" });
        const body = await responseJson<CourseWbsBootstrap>(response);
        if (!active) return;
        setCourses(body.courses);
        setWbsSummaries(body.wbsSummaries);
        setSchedules(body.schedules ?? []);
        setDashboard(body.dashboard);
        setPeople(body.people);
        setEmployeeNames(body.employeeNames);
        setInactivePeople(body.inactivePeople ?? []);
        setTemplate(body.template);
        const requestedCourse = body.courses.find((course) => course.id === initialCourseId);
        if (requestedCourse) {
          setCourseId(requestedCourse.id);
          void loadCourse(requestedCourse.id);
        }
      } catch (caught) {
        if (active) {
          setOverviewFailed(true);
          setError(caught instanceof Error ? caught.message : "강의 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadOverview();
    return () => { active = false; };
  }, [initialCourseId, loadCourse]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(toKoreaDate(new Date().toISOString())), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const course = courses.find((entry) => entry.id === courseId);
  const webinarDate = webinarDateFromTimestamp(course?.webinarAt ?? null);
  const itemProgress = wbsProgress(items, today);
  const sortedItems = useMemo(() => sortWbsItemsByStartDate(items), [items]);
  const ownerPeople = useMemo(() => selectablePeople([...employeeNames, ...people], inactivePeople)
    .sort((a, b) => a.localeCompare(b, "ko")), [employeeNames, people, inactivePeople]);
  const stakeholderPeople = useMemo(() => selectablePeople(people, inactivePeople), [people, inactivePeople]);
  const savedWbsCards = useMemo(() => {
    const summariesByCourse = new Map(wbsSummaries.map((summary) => [summary.courseId, summary]));
    return courses.flatMap((course) => {
      const summary = summariesByCourse.get(course.id);
      return summary ? [{ course, summary }] : [];
    });
  }, [courses, wbsSummaries]);
  const coursesWithoutWbs = useMemo(() => {
    const savedIds = new Set(wbsSummaries.map((summary) => summary.courseId));
    return courses.filter((entry) => isSelectableCourse(entry) && !savedIds.has(entry.id));
  }, [courses, wbsSummaries]);
  const coursesById = useMemo(() => new Map(courses.map((entry) => [entry.id, entry])), [courses]);
  const scheduleEntries = useMemo(() => courseId && courseReady
    ? [...schedules.filter((entry) => entry.courseId !== courseId), { courseId, items }]
    : schedules, [schedules, courseId, courseReady, items]);
  const scheduleOptions = useMemo(() => [...(template?.items ?? []), ...scheduleEntries.flatMap((entry) => entry.items)], [template, scheduleEntries]);
  const closestUnstartedCourse = dashboard.closestUnstartedCourseId
    ? coursesById.get(dashboard.closestUnstartedCourseId) ?? null
    : null;
  const dashboardProgress = dashboard.totalItemCount
    ? Math.round(dashboard.completedItemCount / dashboard.totalItemCount * 100)
    : 0;

  useEffect(() => {
    const newItemId = addedItemId.current;
    if (!newItemId || view !== "list") return;

    const titleInput = titleInputs.current.get(newItemId);
    if (!titleInput) return;

    titleInput.scrollIntoView({ behavior: "smooth", block: "center" });
    titleInput.focus();
    addedItemId.current = null;
  }, [sortedItems, view]);

  function clearFeedback() { setError(""); setNotice(""); setConflictTarget(null); }

  function editItem(id: string, change: Partial<WbsItem>) {
    if (saving || loadingWbs || !courseReady) return;
    if (id === WEBINAR_ITEM_ID && ("title" in change || "startDate" in change || "dueDate" in change)) return;
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...change } : item));
    setDirty(true);
    clearFeedback();
  }

  function selectStartOffset(id: string, value: string) {
    if (value === "none") { editItem(id, { startDate: "", dueDate: "" }); return; }
    if (value === "custom") return;
    const dates = datesForStartOffset(webinarDate, Number(value));
    if (!dates) return;
    const current = items.find((item) => item.id === id);
    let dueDate = dates.dueDate;
    if (current?.startDate && !current.dueDate) {
      dueDate = "";
    } else if (current?.startDate && current.dueDate !== dueDateForStartDate(current.startDate, webinarDate)) {
      const offset = selectedDueOffset(current);
      if (offset !== "none" && offset !== "custom") dueDate = dueDateForOffset(dates.startDate, Number(offset));
    }
    editItem(id, { startDate: dates.startDate, dueDate });
  }

  function selectDueOffset(id: string, value: string) {
    if (value === "none") { editItem(id, { dueDate: "" }); return; }
    if (value === "custom") return;
    const startDate = items.find((item) => item.id === id)?.startDate ?? "";
    const dueDate = dueDateForOffset(startDate, Number(value));
    if (dueDate) editItem(id, { dueDate });
  }

  function addItem() {
    if (saving || loadingWbs || !courseReady) return;
    setItems((current) => {
      const newItem = emptyItem(current.length);
      addedItemId.current = newItem.id;
      return [...ordered(current), newItem];
    });
    setDirty(true);
    setView("list");
    clearFeedback();
  }

  function removeItem(id: string) {
    if (saving || loadingWbs || !courseReady) return;
    if (id === WEBINAR_ITEM_ID) return;
    if (!window.confirm("이 항목을 삭제할까요? 저장하면 삭제가 반영됩니다.")) return;
    setItems((current) => ordered(current.filter((item) => item.id !== id)));
    setDirty(true);
    clearFeedback();
  }

  function moveItem(id: string, direction: -1 | 1) {
    if (saving || loadingWbs || !courseReady) return;
    const next = ordered(items);
    const index = next.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setItems(ordered(next.map((item, position) => ({ ...item, position }))));
    setDirty(true);
  }

  function dragOverItem(event: DragEvent<HTMLTableRowElement>, targetId: string) {
    if (!draggedItemId || draggedItemId === targetId || saving || loadingWbs || !courseReady) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDropTarget((current) => current?.id === targetId && current.position === position ? current : { id: targetId, position });
  }

  function dropItem(event: DragEvent<HTMLTableRowElement>, targetId: string) {
    if (!draggedItemId) return;
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain");
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDraggedItemId(null);
    setDropTarget(null);
    if (!draggedItemId || sourceId !== draggedItemId || sourceId === targetId || saving || loadingWbs || !courseReady) return;

    const next = reorderWbsItems(items, sourceId, targetId, position);
    if (!next) return;
    setItems(next);
    setDirty(true);
    clearFeedback();
  }

  function selectCourse(id: string) {
    if (id === courseId || saving || deleting) return;
    if (dirty && !window.confirm("저장하지 않은 변경 사항이 있습니다. 다른 WBS로 이동할까요?")) return;
    ++loadSequence.current;
    setCourseId(id);
    setNewCourseId("");
    setDraggedItemId(null);
    setDropTarget(null);
    setItems([]);
    setHasWbs(false);
    setUpdatedAt("");
    setDirty(false);
    setCourseReady(false);
    clearFeedback();
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("courseId", id);
    else url.searchParams.delete("courseId");
    window.history.replaceState(null, "", url);
    if (id) void loadCourse(id);
    else setLoadingWbs(false);
  }

  async function deleteWbs() {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    let deleted = false;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/course-wbs/${encodeURIComponent(target.id)}`, { method: "DELETE" });
      if (!response.ok) await responseJson(response);
      deleted = true;
      setWbsSummaries((current) => current.filter((summary) => summary.courseId !== target.id));
      setSchedules((current) => current.filter((entry) => entry.courseId !== target.id));
      setDeleteTarget(null);
      clearFeedback();
      setNotice("강의별 해야할일을 삭제했습니다.");
      const overview = await responseJson<CourseWbsBootstrap>(await fetch("/api/course-wbs", { cache: "no-store" }));
      setCourses(overview.courses);
      setWbsSummaries(overview.wbsSummaries);
      setSchedules(overview.schedules ?? []);
      setDashboard(overview.dashboard);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "WBS 삭제에 실패했습니다.";
      if (!deleted) setDeleteError(message);
      else setError(`WBS는 삭제했지만 목록을 새로 불러오지 못했습니다. 화면을 새로고침해 주세요. ${message}`);
    } finally { setDeleting(false); }
  }

  function reloadCurrentWbs() {
    if (dirty && !window.confirm("현재 편집 내용을 버리고 서버의 최신 WBS를 불러올까요?")) return;
    void loadCourse(courseId);
  }

  function applyTemplate() {
    if (!template || saving || loadingWbs || !courseReady) return;
    if (items.length && (hasWbs || dirty) && !window.confirm("최신 템플릿과 동기화할까요? 완료 체크는 유지되고 추가·삭제·수정된 항목이 반영됩니다. 저장하지 않은 변경 사항은 사라집니다.")) return;
    setItems(ordered(mergeTemplateItems(items, template.items, webinarDate)));
    setDirty(true);
    setView("list");
    setNotice("최신 템플릿과 동기화했습니다. 완료 체크는 유지했습니다. 강의별 해야할일 저장을 눌러 반영하세요.");
    setError("");
  }

  async function saveWbs() {
    if (!courseId || saving || loadingWbs || !courseReady) return;
    const validationError = validateItems(items);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    clearFeedback();
    try {
      const response = await fetch(`/api/course-wbs/${encodeURIComponent(courseId)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: ordered(items), expectedUpdatedAt: updatedAt || null }),
      });
      const body = await responseJson<WbsResponse>(response);
      const savedWbs = body.wbs;
      const savedItems = ordered(savedWbs?.items ?? items);
      setItems(savedItems);
      setPeople((current) => withSavedPeople(current, savedItems));
      setCourses((current) => current.map((entry) => entry.id === courseId ? { ...entry, webinarAt: body.webinarAt } : entry));
      setHasWbs(true);
      setUpdatedAt(savedWbs?.updatedAt ?? "");
      if (savedWbs) setWbsSummaries((current) => [
        ...current.filter((summary) => summary.courseId !== courseId),
        {
          courseId,
          itemCount: savedItems.length,
          completedCount: savedItems.filter((item) => item.completed).length,
          updatedAt: savedWbs.updatedAt,
        },
      ]);
      setSchedules((current) => [...current.filter((entry) => entry.courseId !== courseId), { courseId, items: savedItems }]);
      setDirty(false);
      setNotice("이 강의의 WBS를 저장했습니다.");
      void fetch("/api/course-wbs", { cache: "no-store" })
        .then((response) => responseJson<CourseWbsBootstrap>(response))
        .then((overview) => {
          setCourses(overview.courses);
          setWbsSummaries(overview.wbsSummaries);
          setSchedules(overview.schedules ?? []);
          setDashboard(overview.dashboard);
        })
        .catch(() => undefined);
    } catch (caught) {
      setConflictTarget(caught instanceof ApiError && caught.status === 409 ? "wbs" : null);
      setError(caught instanceof Error ? caught.message : "WBS 저장에 실패했습니다.");
    } finally { setSaving(false); }
  }

  return <>
    <header className="border-b bg-background" aria-label="강의별 해야할일 상단">
      <div className="mx-auto flex min-h-18 max-w-[1900px] items-center gap-3 px-5 py-3 lg:px-8">
        <Button variant="ghost" size="sm" asChild><BackLink href="/work">뒤로가기</BackLink></Button>
        <div className="h-5 w-px shrink-0 bg-border" />
        <span className="min-w-0 line-clamp-2 text-sm font-semibold leading-5 sm:text-base">
          {courseId ? courseWbsHeading(course) : "강의별 해야할일"}
        </span>
      </div>
    </header>
    <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8 lg:py-10">

    {error ? <Alert variant="destructive" className="mb-5" role="alert"><AlertDescription>
      {error}{conflictTarget ? " 현재 편집한 내용은 화면에 남아 있습니다." : ""}
      {conflictTarget === "wbs" ? <div className="mt-3"><Button size="sm" variant="outline" onClick={reloadCurrentWbs}>최신 WBS 불러오기</Button></div> : null}
    </AlertDescription></Alert> : null}
    {notice ? <Alert className="mb-5" role="status"><AlertDescription>{notice}</AlertDescription></Alert> : null}

    {loading ? <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" /> 강의 목록을 불러오는 중...</div> : overviewFailed ? (
      <div className="rounded-xl border border-dashed bg-background px-6 py-16 text-center"><p className="text-sm text-muted-foreground">강의와 템플릿 목록을 불러오지 못했습니다.</p><Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>다시 시도</Button></div>
    ) : !courses.length ? (
      <div className="rounded-xl border border-dashed bg-background px-6 py-16 text-center">
        <ClipboardList className="mx-auto mb-4 size-9 text-muted-foreground" />
        <h3 className="font-semibold">연결할 강의가 없습니다</h3>
        <p className="mt-2 text-sm text-muted-foreground">강의를 만든 뒤 WBS를 연결할 수 있습니다.</p>
        <Button className="mt-5" asChild><Link href="/services/course-operations/new"><Plus /> 강의 만들기</Link></Button>
      </div>
    ) : !courseId ? <Tabs value={overviewTab} onValueChange={(value) => setOverviewTab(value as "manage" | "analysis" | "summary")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
      <TabsList aria-label="강의별 해야할일 화면">
        <TabsTrigger value="manage"><ClipboardList /> WBS 관리</TabsTrigger>
        <TabsTrigger value="summary">업무 요약</TabsTrigger>
        <TabsTrigger value="analysis"><CalendarDays /> 업무 현황</TabsTrigger>
      </TabsList>
      <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link href="/services/course-wbs/templates">템플릿 관리</Link></Button><Button onClick={() => { setNewCourseId(""); setCreateDialogOpen(true); }} disabled={deleting}><Plus /> WBS 만들기</Button></div>
      </div>
      <TabsContent value="summary" className="mt-6"><WbsAttention courses={courses} entries={schedules} today={today} templateItems={template?.items ?? []} onSelect={(id, item) => { selectCourse(id); setView("list"); if (item) addedItemId.current = item.id; }} /></TabsContent>
      <TabsContent value="analysis" className="mt-6">
      <section className="mb-8" aria-label="WBS 대시보드">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-xl border bg-background p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">전체 진행 상황</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">{dashboardProgress}%</p>
              </div>
              <Badge variant="secondary">WBS {dashboard.savedWbsCount}개</Badge>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${dashboardProgress}%` }} /></div>
            <p className="mt-3 text-sm text-muted-foreground">전체 업무 {dashboard.totalItemCount}개 중 {dashboard.completedItemCount}개 완료 · {dashboard.totalItemCount - dashboard.completedItemCount}개 남음</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5 shadow-sm dark:border-blue-900 dark:bg-blue-950/20">
            <div className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-blue-700 dark:text-blue-300" />아직 시작하지 않은 가장 가까운 강의</div>
            <p className="mt-1 text-xs text-muted-foreground">완료한 업무가 0개인 WBS를 기준으로 계산합니다.</p>
            {closestUnstartedCourse?.webinarAt ? <button type="button" onClick={() => selectCourse(closestUnstartedCourse.id)} className="mt-4 block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate font-semibold">{courseLabel(closestUnstartedCourse)}</p><p className="mt-1 text-sm text-muted-foreground">무료 웨비나 · {toKoreaDate(closestUnstartedCourse.webinarAt)} {toKoreaTime(closestUnstartedCourse.webinarAt)}</p></div>
                <Badge className="shrink-0 bg-blue-700 text-white hover:bg-blue-700">{remainingDayLabel(toKoreaDate(closestUnstartedCourse.webinarAt), today)}</Badge>
              </div>
            </button> : <p className="mt-4 text-sm text-muted-foreground">예정된 강의 중 아직 시작하지 않은 WBS가 없습니다.</p>}
          </div>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <DashboardTaskList title="일정 지연 업무" description="예정일이 지난 미완료 업무입니다. 오래 지연된 순서로 표시합니다." emptyMessage="일정이 지연된 업무가 없습니다." tasks={dashboard.overdueTasks} coursesById={coursesById} today={today} onSelectCourse={selectCourse} delayed />
          <DashboardTaskList title="7일 이내 일정" description="오늘부터 7일 안에 시작하거나 마감하는 미완료 업무입니다." emptyMessage="7일 이내 예정된 업무가 없습니다." tasks={dashboard.upcomingTasks} coursesById={coursesById} today={today} onSelectCourse={selectCourse} delayed={false} />
        </div>
        <p className="mt-3 text-right text-xs text-muted-foreground">지연·임박 업무는 합계 최대 20개까지 표시합니다.</p>
      </section>
      </TabsContent>

      <TabsContent value="manage" className="mt-6">
      <section aria-label="저장된 강의별 해야할일">
        {savedWbsCards.length ? <div className="overflow-x-auto rounded-xl border bg-background"><table className="w-full min-w-[1000px] text-sm" aria-label="강의별 해야할일 목록">
          <thead className="bg-muted/50 text-left"><tr>{["강의", "강사", "기수", "웨비나 날짜", "상태", "업무", "진행", "완료", "진행률", "미진행", ""].map((label, index) => <th key={index} className="whitespace-nowrap px-4 py-3" title={label === "진행" ? "완료되지 않은 전체 업무 수" : label === "미진행" ? "기한이 지났지만 완료되지 않은 업무 수" : undefined}>{label}</th>)}</tr></thead><tbody>
          {savedWbsCards.map(({ summary, course: linkedCourse }) => {
            const counts = wbsProgress(schedules.find((entry) => entry.courseId === summary.courseId)?.items ?? [], today);
            return <tr key={summary.courseId} className="border-t">
              <td className="px-4 py-3"><button type="button" onClick={() => selectCourse(summary.courseId)} disabled={deleting} className="text-left font-medium text-primary hover:underline">{linkedCourse.name}</button></td>
              <td className="px-4 py-3">{linkedCourse.instructorName || "—"}</td><td className="px-4 py-3">{linkedCourse.cohort || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3">{linkedCourse.webinarAt ? toKoreaDate(linkedCourse.webinarAt) : "—"}</td><td className="px-4 py-3">{COURSE_STATUS_LABELS[linkedCourse.status]}</td>
              <td className="px-4 py-3 tabular-nums">{counts.total}</td><td className="px-4 py-3 tabular-nums">{counts.remaining}</td><td className="px-4 py-3 tabular-nums">{counts.completed}</td><td className="px-4 py-3 tabular-nums">{counts.progress}%</td><td className={`px-4 py-3 tabular-nums ${counts.overdue ? "font-semibold text-destructive" : ""}`}>{counts.overdue}</td>
              <td className="px-2 py-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`${courseLabel(linkedCourse)} WBS 메뉴`} disabled={deleting}><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onSelect={() => { setDeleteError(""); setDeleteTarget(linkedCourse); }}><Trash2 /> WBS 삭제</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu></td>
            </tr>;
          })}
        </tbody></table></div> : <div className="rounded-xl border border-dashed bg-background px-6 py-14 text-center text-sm text-muted-foreground">저장된 WBS가 없습니다. 상단의 WBS 만들기 버튼으로 강의를 연결하세요.</div>}
      </section>

      <WbsStartSchedule courses={courses} entries={scheduleEntries} options={scheduleOptions} selected={selectedScheduleItem} onSelect={setSelectedScheduleItem} today={today} onSelectCourse={selectCourse} />
      </TabsContent>
    </Tabs> : <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2" role="group" aria-label="WBS 작업">
        <Button size="sm" variant="outline" onClick={() => { selectCourse(""); setOverviewTab("manage"); }}>WBS 목록</Button>
        <Button size="sm" variant="outline" onClick={applyTemplate} disabled={!template || !courseReady || loadingWbs || saving}><ClipboardList /> 템플릿 불러오기</Button>
        <div className="flex shrink-0 items-center gap-2">
          {course ? <Button variant="outline" size="sm" asChild><Link href={`/services/course-operations/${course.id}`}>강의 상세 <ExternalLink /></Link></Button> : null}
          <Button size="sm" onClick={() => void saveWbs()} disabled={saving || loadingWbs || !courseReady || !courseId || (!dirty && hasWbs)}>
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />} 강의별 해야할일 저장
          </Button>
        </div>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="업무 현황">
        {[
          { label: "업무", value: `${itemProgress.total}개`, help: "등록된 전체 업무" },
          { label: "진행", value: `${itemProgress.remaining}개`, help: "완료되지 않은 전체 업무" },
          { label: "완료", value: `${itemProgress.completed}개`, help: "완료한 업무" },
          { label: "진행률", value: `${itemProgress.progress}%`, help: "전체 업무 대비 완료 비율" },
          { label: "미진행", value: `${itemProgress.overdue}개`, help: "기한이 지났지만 완료되지 않은 업무" },
        ].map((stat) => <div key={stat.label} className="rounded-xl border bg-background p-4 shadow-sm" title={stat.help}><p className="text-xs text-muted-foreground">{stat.label}</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${stat.label === "미진행" && itemProgress.overdue ? "text-destructive" : ""}`}>{courseReady ? stat.value : "—"}</p></div>)}
      </section>

      <section className="min-w-0" aria-label="강의별 해야할일 항목">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-lg border bg-background p-1" role="group" aria-label="보기 방식">
              <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} aria-pressed={view === "list"}><ClipboardList /> 목록</Button>
              <Button size="sm" variant={view === "compact" ? "secondary" : "ghost"} onClick={() => setView("compact")} aria-pressed={view === "compact"}><ClipboardList /> 간소화목록</Button>
              <Button size="sm" variant={view === "gantt" ? "secondary" : "ghost"} onClick={() => setView("gantt")} aria-pressed={view === "gantt"}><CalendarDays /> 간트 차트</Button>
            </div>
            {view === "compact" ? <p className="text-xs text-muted-foreground">완료 여부를 변경한 뒤 강의별 해야할일 저장을 눌러 주세요.</p> : null}
            {view !== "compact" ? <Button size="sm" variant="outline" onClick={addItem} disabled={loadingWbs || !courseReady || saving}><Plus /> 항목 추가</Button> : null}
          </div>
          {loadingWbs ? <div className="flex min-h-72 items-center justify-center rounded-xl border bg-background text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" /> WBS를 불러오는 중...</div> : !courseReady ? <div className="rounded-xl border border-dashed bg-background px-6 py-16 text-center text-sm text-muted-foreground">이 강의의 WBS를 불러오지 못했습니다.<div><Button className="mt-4" variant="outline" onClick={() => void loadCourse(courseId)}>다시 시도</Button></div></div> : view === "gantt" ? <WbsGantt key={courseId} items={sortedItems} webinarDate={webinarDate} todayDate={today} onSelectItem={setSelectedScheduleItem} selectedItemId={selectedScheduleItem?.id} /> : view === "compact" ? (
            <div className="overflow-x-auto rounded-xl border bg-background shadow-sm" aria-busy={saving}>
              <table className="w-full min-w-[760px] border-collapse text-sm" aria-label="간소화 WBS 목록">
                <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th scope="col" className="w-16 px-4 py-3 text-center">완료</th>
                    <th scope="col" className="min-w-64 px-4 py-3">업무 제목</th>
                    <th scope="col" className="w-36 px-4 py-3">담당자</th>
                    <th scope="col" className="w-36 px-4 py-3">관계자</th>
                    <th scope="col" className="w-36 px-4 py-3">시작일 날짜</th>
                    <th scope="col" className="w-36 px-4 py-3">데드라인 날짜</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item, index) => <tr key={item.id} className={`border-t ${isPastItem(item, today) ? "bg-muted/60" : item.id === WEBINAR_ITEM_ID ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3 text-center"><input type="checkbox" className="size-4 accent-primary" checked={item.completed} onChange={(event) => editItem(item.id, { completed: event.target.checked })} aria-label={`${item.title || `${index + 1}번째 항목`} 완료`} disabled={saving} /></td>
                    <td className={`px-4 py-3 font-medium ${item.completed ? "text-muted-foreground line-through" : ""}`}><button type="button" onClick={() => setSelectedScheduleItem(item)} aria-pressed={selectedScheduleItem?.id === item.id} className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.title || "—"}</button><div className="mt-1"><WbsTaskLink item={item} courseId={courseId} templateItems={template?.items} /></div></td>
                    <td className="px-4 py-3">{item.owner || "—"}</td>
                    <td className="px-4 py-3">{item.stakeholders || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{item.startDate ? <time dateTime={item.startDate}>{item.startDate}</time> : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{item.dueDate ? <time dateTime={item.dueDate}>{item.dueDate}</time> : "—"}</td>
                  </tr>)}
                  {!sortedItems.length ? <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-muted-foreground">항목이 없습니다. 목록 탭에서 템플릿을 불러오거나 항목을 추가하세요.</td></tr> : null}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-background shadow-sm" aria-busy={saving}>
              <table className="w-full min-w-[1320px] border-collapse text-sm">
                <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="w-12 px-3 py-3 text-center">완료</th>
                    <th className="min-w-96 px-3 py-3">업무 제목 · 설명</th>
                    <th className="w-40 px-3 py-3">담당자</th>
                    <th className="w-40 px-3 py-3">관계자</th>
                    <th className="w-44 px-3 py-3">시작일 (D-며칠)</th>
                    <th className="w-44 px-3 py-3">데드라인 (D-며칠)</th>
                    <th className="w-24 px-3 py-3 text-center">순서 · 삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((item, index) => <tr key={item.id} onDragOver={(event) => dragOverItem(event, item.id)} onDrop={(event) => dropItem(event, item.id)} className={`border-t align-top ${isPastItem(item, today) ? "bg-muted/60" : item.id === WEBINAR_ITEM_ID ? "bg-primary/5" : ""} ${draggedItemId === item.id ? "opacity-40" : ""} ${dropTarget?.id === item.id ? dropTarget.position === "before" ? "border-t-4 border-t-primary" : "border-b-4 border-b-primary" : ""}`}>
                    <td className="px-3 py-4 text-center"><input type="checkbox" className="size-4 accent-primary" checked={item.completed} onChange={(event) => editItem(item.id, { completed: event.target.checked })} aria-label={`${item.title || `${index + 1}번째 항목`} 완료`} disabled={saving} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-start gap-2">
                        <span draggable={!saving} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDraggedItemId(item.id); setDropTarget(null); }} onDragEnd={() => { setDraggedItemId(null); setDropTarget(null); }} title="드래그하여 순서 변경" aria-hidden="true" className="flex h-10 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"><GripVertical className="size-4" /></span>
                        <div className="min-w-0 flex-1">
                          <Input ref={(element) => {
                            if (element) titleInputs.current.set(item.id, element);
                            else titleInputs.current.delete(item.id);
                          }} value={item.title} onFocus={() => setSelectedScheduleItem(item)} onChange={(event) => editItem(item.id, { title: event.target.value })} placeholder="업무 제목" aria-label={`${index + 1}번째 업무 제목`} className={item.completed ? "line-through" : ""} disabled={saving || item.id === WEBINAR_ITEM_ID} />
                          {item.id === WEBINAR_ITEM_ID ? <p className="mt-1 text-xs text-muted-foreground">날짜는 강의 상세의 무료웨비나 일정과 연결됩니다.</p> : null}
                          <Textarea value={item.description ?? ""} onChange={(event) => editItem(item.id, { description: event.target.value })} placeholder="업무 설명 또는 세부 체크 내용" aria-label={`${index + 1}번째 업무 설명`} rows={2} className="mt-2 min-h-14 resize-y text-xs" disabled={saving} />
                          <div className="mt-2"><WbsTaskLink item={item} courseId={courseId} templateItems={template?.items} /></div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><PeoplePicker value={item.owner} people={ownerPeople} disabled={saving} label={`${index + 1}번째 담당자`} onChange={(value) => editItem(item.id, { owner: value })} /></td>
                    <td className="px-3 py-3"><PeoplePicker value={item.stakeholders} people={stakeholderPeople} disabled={saving} label={`${index + 1}번째 관계자`} onChange={(value) => editItem(item.id, { stakeholders: value })} /></td>
                    <td className="px-3 py-3">
                      {item.id === WEBINAR_ITEM_ID ? (
                        <select value="webinar" disabled aria-label="무료웨비나 시작일 기준" className="mb-2 h-9 w-full rounded-lg border border-input bg-background px-2 text-xs"><option value="webinar">무료웨비나 당일</option></select>
                      ) : (
                        <select value={selectedStartOffset(item, webinarDate)} onChange={(event) => selectStartOffset(item.id, event.target.value)} aria-label={`${index + 1}번째 시작일 선택`} disabled={saving || !webinarDate} className="mb-2 h-9 w-full rounded-lg border border-input bg-background px-2 text-xs">
                          <option value="none">일정 없음</option>
                          <option value="custom" disabled>기존 일정</option>
                          {WBS_START_OFFSETS.map((option) => <option key={option.daysBefore} value={option.daysBefore}>{option.label}</option>)}
                        </select>
                      )}
                      <Input type="date" value={item.startDate} aria-label={`${index + 1}번째 시작일 날짜`} disabled className="disabled:bg-background disabled:opacity-100 dark:disabled:bg-input/30" />
                      {webinarDayLabel(item.startDate, webinarDate) ? <span className="mt-1 block text-xs font-medium text-primary">{webinarDayLabel(item.startDate, webinarDate)}</span> : null}
                    </td>
                    <td className="px-3 py-3">
                      {item.id === WEBINAR_ITEM_ID ? (
                        <select value="webinar" disabled aria-label="무료웨비나 데드라인 기준" className="mb-2 h-9 w-full rounded-lg border border-input bg-background px-2 text-xs"><option value="webinar">무료웨비나 당일</option></select>
                      ) : (
                        <select value={selectedDueOffset(item)} onChange={(event) => selectDueOffset(item.id, event.target.value)} aria-label={`${index + 1}번째 데드라인 선택`} disabled={saving || !item.startDate} className="mb-2 h-9 w-full rounded-lg border border-input bg-background px-2 text-xs">
                          <option value="none">일정 없음</option>
                          <option value="custom" disabled>기존 일정</option>
                          {WBS_DUE_OFFSETS.map((option) => <option key={option.daysAfter} value={option.daysAfter}>{option.label}</option>)}
                        </select>
                      )}
                      <Input type="date" value={item.dueDate} aria-label={`${index + 1}번째 데드라인 날짜`} disabled className="disabled:bg-background disabled:opacity-100 dark:disabled:bg-input/30" />
                      {webinarDayLabel(item.dueDate, webinarDate) ? <span className="mt-1 block text-xs font-medium text-primary">{webinarDayLabel(item.dueDate, webinarDate)}</span> : null}
                    </td>
                    <td className="px-3 py-3"><div className="flex items-center justify-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => moveItem(item.id, -1)} disabled={saving || index === 0} aria-label={`${item.title || `${index + 1}번째 항목`} 위로 이동`}><ArrowUp /></Button>
                      <Button size="icon" variant="ghost" onClick={() => moveItem(item.id, 1)} disabled={saving || index === sortedItems.length - 1} aria-label={`${item.title || `${index + 1}번째 항목`} 아래로 이동`}><ArrowDown /></Button>
                      <Button size="icon" variant="ghost" onClick={() => removeItem(item.id)} disabled={saving || item.id === WEBINAR_ITEM_ID} aria-label={`${item.title || `${index + 1}번째 항목`} 삭제`} className="text-destructive"><Trash2 /></Button>
                    </div></td>
                  </tr>)}
                  {!sortedItems.length ? <tr><td colSpan={7} className="px-6 py-16 text-center text-sm text-muted-foreground">항목이 없습니다. 템플릿을 불러오거나 항목을 추가하세요.</td></tr> : null}
                </tbody>
              </table>
            </div>
          )}
          {view === "gantt" && !loadingWbs ? <p className="mt-3 text-xs text-muted-foreground">일정과 완료 상태는 목록 보기에서 수정할 수 있습니다. 막대는 시작일에서 데드라인까지 표시됩니다.</p> : null}
      </section>
      {courseReady ? <WbsStartSchedule courses={courses} entries={scheduleEntries} options={scheduleOptions} selected={selectedScheduleItem} onSelect={setSelectedScheduleItem} today={today} onSelectCourse={selectCourse} /> : null}
    </>}
    </div>
    <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogHeader><DialogTitle>WBS 만들기</DialogTitle></DialogHeader>
        {coursesWithoutWbs.length ? <form onSubmit={(event) => { event.preventDefault(); if (!newCourseId) return; selectCourse(newCourseId); setCreateDialogOpen(false); }}>
          <label htmlFor="wbs-new-course" className="mb-2 block text-sm font-medium">연결할 강의</label>
          <select id="wbs-new-course" value={newCourseId} onChange={(event) => setNewCourseId(event.target.value)} required className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
            <option value="">강의를 선택하세요</option>
            {coursesWithoutWbs.map((entry) => <option value={entry.id} key={entry.id}>{courseLabel(entry)}</option>)}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">해야할일이 없는 강의만 선택할 수 있습니다. 항목을 편집한 뒤 강의별 해야할일 저장을 눌러 주세요.</p>
          <DialogFooter className="mt-5"><Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>취소</Button><Button type="submit" disabled={!newCourseId}><Plus /> WBS 만들기</Button></DialogFooter>
        </form> : <div className="py-4 text-sm text-muted-foreground"><p>모든 강의에 WBS가 연결되어 있습니다.</p><Button className="mt-4" variant="outline" asChild><Link href="/services/course-operations/new"><Plus /> 강의 만들기</Link></Button></div>}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
      <DialogContent aria-describedby={undefined} showCloseButton={!deleting}>
        <DialogHeader><DialogTitle>WBS 삭제</DialogTitle></DialogHeader>
        <div className="text-sm"><p className="font-medium">{deleteTarget ? courseLabel(deleteTarget) : ""}</p><p className="mt-3 text-muted-foreground">이 WBS의 모든 업무 항목을 삭제합니다. 연결된 강의는 유지되며, 삭제한 WBS는 복구할 수 없습니다.</p></div>
        {deleteError ? <p role="alert" className="text-sm text-destructive">{deleteError}</p> : null}
        <DialogFooter><Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>취소</Button><Button variant="destructive" disabled={deleting} onClick={() => void deleteWbs()}>{deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />} 삭제</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
