"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import {
  ArrowDown, ArrowLeft, ArrowUp, CalendarDays, ChevronDown, ClipboardList, ExternalLink, GripVertical,
  LoaderCircle, Plus, Save, Trash2,
} from "lucide-react";

import { WbsGantt } from "@/components/course-wbs/wbs-gantt";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toKoreaDate, toKoreaTime } from "@/lib/course-operations/schedule";
import { reorderWbsItems } from "@/lib/course-wbs/reorder";
import { datesForStartOffset, dueDateForOffset, dueDateForStartDate, WBS_DUE_OFFSETS, WBS_START_OFFSETS } from "@/lib/course-wbs/schedule-options";
import type { CourseWbs, CourseWbsBootstrap, WbsCourse, WbsItem, WbsSummary, WbsTemplate } from "@/lib/course-wbs/types";
import { applyTemplateToCourse, syncWebinarItem, webinarDateFromTimestamp, webinarDayLabel, WEBINAR_ITEM_ID } from "@/lib/course-wbs/webinar-date";

type WbsResponse = { wbs: CourseWbs | null; webinarAt: string | null };

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

function reusableItems(items: WbsItem[]) {
  return ordered(items).map((item) => ({ ...item, completed: false }));
}

function courseLabel(course: WbsCourse) {
  const cohort = course.cohort.trim();
  return [course.instructorName || "강사 미입력", course.name, cohort ? `${cohort}${cohort.endsWith("기") ? "" : "기"}` : ""].filter(Boolean).join(" · ");
}

function courseCohort(course: WbsCourse) {
  const cohort = course.cohort.trim();
  return cohort ? `${cohort}${cohort.endsWith("기") ? "" : "기"}` : "기수 미입력";
}

function savedWbsProgress(summary: WbsSummary) {
  return summary.itemCount ? Math.round(summary.completedCount / summary.itemCount * 100) : 0;
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
  const [newCourseId, setNewCourseId] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);
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
  const [conflictTarget, setConflictTarget] = useState<"wbs" | "template" | null>(null);
  const [today, setToday] = useState(() => toKoreaDate(new Date().toISOString()));
  const loadSequence = useRef(0);

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
        setPeople(body.people);
        setEmployeeNames(body.employeeNames);
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
  const webinarTime = course?.webinarAt ? toKoreaTime(course.webinarAt) : "";
  const completed = items.filter((item) => item.completed).length;
  const notCompleted = items.length - completed;
  const progress = items.length ? Math.round(completed / items.length * 100) : 0;
  const overdueItems = items.filter((item) => {
    const scheduled = item.dueDate || item.startDate;
    return !item.completed && Boolean(scheduled) && scheduled <= today;
  });
  const sortedItems = useMemo(() => ordered(items), [items]);
  const ownerPeople = useMemo(() => [...new Set([...employeeNames, ...people])]
    .sort((a, b) => a.localeCompare(b, "ko")), [employeeNames, people]);
  const savedWbsCards = useMemo(() => {
    const coursesById = new Map(courses.map((entry) => [entry.id, entry]));
    return wbsSummaries
      .map((summary) => ({ summary, course: coursesById.get(summary.courseId) }))
      .filter((entry): entry is { summary: WbsSummary; course: WbsCourse } => Boolean(entry.course))
      .sort((a, b) => b.summary.updatedAt.localeCompare(a.summary.updatedAt));
  }, [courses, wbsSummaries]);
  const coursesWithoutWbs = useMemo(() => {
    const savedIds = new Set(wbsSummaries.map((summary) => summary.courseId));
    return courses.filter((entry) => !savedIds.has(entry.id));
  }, [courses, wbsSummaries]);

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
    setItems((current) => [...ordered(current), emptyItem(current.length)]);
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
    if (id === courseId || saving) return;
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

  async function refreshTemplate() {
    setSaving(true);
    try {
      const response = await fetch("/api/course-wbs", { cache: "no-store" });
      const body = await responseJson<CourseWbsBootstrap>(response);
      setTemplate(body.template);
      setPeople(body.people);
      setEmployeeNames(body.employeeNames);
      setConflictTarget(null);
      setError("");
      setNotice("최신 템플릿을 불러왔습니다. 현재 강의의 편집 내용은 유지했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "템플릿을 다시 불러오지 못했습니다.");
    } finally { setSaving(false); }
  }

  function reloadCurrentWbs() {
    if (dirty && !window.confirm("현재 편집 내용을 버리고 서버의 최신 WBS를 불러올까요?")) return;
    void loadCourse(courseId);
  }

  function applyTemplate() {
    if (!template || saving || loadingWbs || !courseReady) return;
    if (items.length && (hasWbs || dirty) && !window.confirm("현재 목록을 템플릿으로 바꿀까요? 저장하지 않은 변경 사항은 사라집니다.")) return;
    setItems(ordered(applyTemplateToCourse(template.items, webinarDate).map((item) => ({
      ...item, id: item.id === WEBINAR_ITEM_ID ? WEBINAR_ITEM_ID : crypto.randomUUID(), completed: false,
    }))));
    setDirty(true);
    setView("list");
    setNotice("템플릿을 불러왔습니다. 강의 WBS 저장을 눌러 연결하세요.");
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
      setDirty(false);
      setNotice("이 강의의 WBS를 저장했습니다.");
    } catch (caught) {
      setConflictTarget(caught instanceof ApiError && caught.status === 409 ? "wbs" : null);
      setError(caught instanceof Error ? caught.message : "WBS 저장에 실패했습니다.");
    } finally { setSaving(false); }
  }

  async function saveTemplate() {
    if (!template || saving || loadingWbs || !courseReady) return;
    if (!items.length) { setError("템플릿으로 저장할 항목을 먼저 추가해 주세요."); return; }
    const validationError = validateItems(items);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    clearFeedback();
    try {
      const response = await fetch(`/api/course-wbs/templates/${encodeURIComponent(template.id)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: template.name, items: reusableItems(items), expectedUpdatedAt: template.updatedAt }),
      });
      const body = await responseJson<{ template: WbsTemplate }>(response);
      setTemplate(body.template);
      setPeople((current) => withSavedPeople(current, body.template.items));
      setNotice("템플릿을 업데이트했습니다. 이미 저장된 다른 강의 WBS는 그대로 유지됩니다.");
    } catch (caught) {
      setConflictTarget(caught instanceof ApiError && caught.status === 409 ? "template" : null);
      setError(caught instanceof Error ? caught.message : "템플릿 저장에 실패했습니다.");
    } finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-[1800px] px-5 py-8 lg:px-8 lg:py-10">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Badge variant="outline" className="mb-3 bg-background">강의 준비 · 웨비나 운영</Badge>
        <h2 className="text-3xl font-semibold tracking-tight">강의 WBS</h2>
        <p className="mt-2 text-sm text-muted-foreground">강의별 WBS를 선택해 업무와 일정을 관리하세요.</p>
      </div>
      {courseId ? <Button size="sm" variant="outline" onClick={() => selectCourse("")} disabled={saving}><ArrowLeft /> WBS 목록</Button> : null}
    </div>

    {error ? <Alert variant="destructive" className="mb-5" role="alert"><AlertDescription>
      {error}{conflictTarget ? " 현재 편집한 내용은 화면에 남아 있습니다." : ""}
      {conflictTarget === "wbs" ? <div className="mt-3"><Button size="sm" variant="outline" onClick={reloadCurrentWbs}>최신 WBS 불러오기</Button></div> : null}
      {conflictTarget === "template" ? <div className="mt-3"><Button size="sm" variant="outline" onClick={() => void refreshTemplate()} disabled={saving}>템플릿 새로고침</Button></div> : null}
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
    ) : !courseId ? <>
      <section aria-label="저장된 강의 WBS">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">저장된 WBS</h3>
            <p className="mt-1 text-sm text-muted-foreground">연결된 강의를 선택하면 해당 WBS를 열 수 있습니다.</p>
          </div>
          <Badge variant="secondary">{savedWbsCards.length}개</Badge>
        </div>
        {savedWbsCards.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {savedWbsCards.map(({ summary, course: linkedCourse }) => {
            const cardProgress = savedWbsProgress(summary);
            return <button key={summary.courseId} type="button" onClick={() => selectCourse(summary.courseId)} aria-label={`${courseLabel(linkedCourse)} WBS 열기`} className="group rounded-xl border bg-background p-5 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline">강의 WBS</Badge>
                <span className="text-xs text-muted-foreground">마지막 저장 {new Date(summary.updatedAt).toLocaleDateString("ko-KR")}</span>
              </div>
              <p className="mt-5 text-sm font-medium text-primary">{linkedCourse.instructorName || "강사 미입력"}</p>
              <h4 className="mt-1 text-lg font-semibold group-hover:text-primary">{linkedCourse.name}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{courseCohort(linkedCourse)}</p>
              <div className="mt-5 border-t pt-4">
                <p className="text-sm"><span className="text-muted-foreground">무료 웨비나</span> <span className="ml-2 font-medium">{linkedCourse.webinarAt ? `${toKoreaDate(linkedCourse.webinarAt)} ${toKoreaTime(linkedCourse.webinarAt)}` : "일정 미정"}</span></p>
                <div className="mt-4 flex items-center justify-between text-sm"><span className="text-muted-foreground">업무 {summary.itemCount}개 · 완료 {summary.completedCount}개</span><span className="font-semibold tabular-nums">{cardProgress}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${cardProgress}%` }} /></div>
              </div>
            </button>;
          })}
        </div> : <div className="rounded-xl border border-dashed bg-background px-6 py-14 text-center text-sm text-muted-foreground">저장된 WBS가 없습니다. 아래에서 강의를 선택해 첫 WBS를 만들어 보세요.</div>}
      </section>

      <section className="mt-7 rounded-xl border bg-background p-5 shadow-sm" aria-label="새 WBS 만들기">
        <h3 className="text-lg font-semibold">새 WBS 만들기</h3>
        {coursesWithoutWbs.length ? <>
          <p className="mt-1 text-sm text-muted-foreground">아직 WBS가 없는 강의를 연결합니다.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label htmlFor="wbs-new-course" className="mb-2 block text-sm font-medium">연결할 강의</label>
              <select id="wbs-new-course" value={newCourseId} onChange={(event) => setNewCourseId(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm">
                <option value="">강의를 선택하세요</option>
                {coursesWithoutWbs.map((entry) => <option value={entry.id} key={entry.id}>{courseLabel(entry)}</option>)}
              </select>
            </div>
            <Button onClick={() => selectCourse(newCourseId)} disabled={!newCourseId}><Plus /> 새 WBS 만들기</Button>
          </div>
        </> : <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>모든 강의에 WBS가 연결되어 있습니다.</span>
          <Button size="sm" variant="outline" asChild><Link href="/services/course-operations/new"><Plus /> 강의 만들기</Link></Button>
        </div>}
      </section>
    </> : <>
      <section className="mb-4 rounded-xl border bg-background p-5 shadow-sm" aria-label="연결된 강의">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-64 flex-1">
            <p className="text-xs font-medium text-muted-foreground">연결된 강의</p>
            <h3 className="mt-2 text-xl font-semibold">{course ? courseLabel(course) : "강의 정보 확인 중"}</h3>
            <p className="mt-2 text-sm text-muted-foreground">무료 웨비나 · {webinarDate ? `${webinarDate}${webinarTime ? ` ${webinarTime}` : ""}` : "강의 상세에서 날짜를 설정해 주세요."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void saveTemplate()} disabled={!template || !courseReady || !items.length || loadingWbs || saving}><Save /> 템플릿으로 저장</Button>
            <Button size="sm" variant="outline" onClick={applyTemplate} disabled={!template || !courseReady || loadingWbs || saving}><ClipboardList /> 템플릿 불러오기</Button>
            {course ? <Button variant="outline" size="sm" asChild><Link href={`/services/course-operations/${course.id}`}>강의 상세 <ExternalLink /></Link></Button> : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground">
            <p>{dirty ? "저장하지 않은 변경 사항이 있습니다." : hasWbs ? "이 강의에 저장된 WBS입니다." : "아직 이 강의에 WBS가 없습니다. 템플릿을 불러오거나 항목을 추가하세요."}</p>
            {updatedAt && !dirty ? <p className="mt-1">마지막 저장 {new Date(updatedAt).toLocaleString("ko-KR")}</p> : null}
          </div>
          <Button onClick={() => void saveWbs()} disabled={saving || loadingWbs || !courseReady || !courseId || (!dirty && hasWbs)}>
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />} 강의 WBS 저장
          </Button>
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="업무 현황">
        <div className="rounded-xl border bg-background p-4 shadow-sm"><p className="text-xs text-muted-foreground">업무 전체현황</p><p className="mt-2 text-2xl font-semibold tabular-nums">{courseReady ? `${items.length}개` : "—"}</p><p className="mt-1 text-xs text-muted-foreground">등록된 전체 항목</p></div>
        <div className="rounded-xl border bg-background p-4 shadow-sm"><p className="text-xs text-muted-foreground">진행현황</p><p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-700">{courseReady ? `${completed}개` : "—"}</p><p className="mt-1 text-xs text-muted-foreground">완료한 업무</p></div>
        <div className="rounded-xl border bg-background p-4 shadow-sm"><p className="text-xs text-muted-foreground">미진행현황</p><p className="mt-2 text-2xl font-semibold tabular-nums">{courseReady ? `${notCompleted}개` : "—"}</p><p className="mt-1 text-xs text-muted-foreground">완료하지 않은 업무</p></div>
        <div className="rounded-xl border bg-background p-4 shadow-sm"><p className="text-xs text-muted-foreground">진행률</p><p className="mt-2 text-2xl font-semibold tabular-nums">{courseReady ? `${progress}%` : "—"}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/20"><p className="text-xs text-muted-foreground">오늘까지 미진행 업무</p><p className="mt-2 text-2xl font-semibold tabular-nums text-amber-800 dark:text-amber-300">{courseReady ? `${overdueItems.length}개` : "—"}</p><p className="mt-1 truncate text-xs text-muted-foreground" title={overdueItems.map((item) => item.title).join(", ")}>{overdueItems.length ? overdueItems.slice(0, 2).map((item) => item.title).join(" · ") : "오늘까지 마감된 미완료 업무 없음"}</p></div>
      </section>

      <section className="min-w-0" aria-label="강의 WBS 항목">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-lg border bg-background p-1" role="group" aria-label="보기 방식">
              <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")} aria-pressed={view === "list"}><ClipboardList /> 목록</Button>
              <Button size="sm" variant={view === "compact" ? "secondary" : "ghost"} onClick={() => setView("compact")} aria-pressed={view === "compact"}><ClipboardList /> 간소화목록</Button>
              <Button size="sm" variant={view === "gantt" ? "secondary" : "ghost"} onClick={() => setView("gantt")} aria-pressed={view === "gantt"}><CalendarDays /> 간트 차트</Button>
            </div>
            <p className="text-xs text-muted-foreground">{view === "compact" ? "완료 여부를 변경한 뒤 강의 WBS 저장을 눌러 주세요." : "담당자·관계자는 목록에서 선택하거나 새 이름을 입력한 뒤 저장할 수 있습니다."}</p>
            {view !== "compact" ? <Button size="sm" variant="outline" onClick={addItem} disabled={loadingWbs || !courseReady || saving}><Plus /> 항목 추가</Button> : null}
          </div>
          {loadingWbs ? <div className="flex min-h-72 items-center justify-center rounded-xl border bg-background text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" /> WBS를 불러오는 중...</div> : !courseReady ? <div className="rounded-xl border border-dashed bg-background px-6 py-16 text-center text-sm text-muted-foreground">이 강의의 WBS를 불러오지 못했습니다.<div><Button className="mt-4" variant="outline" onClick={() => void loadCourse(courseId)}>다시 시도</Button></div></div> : view === "gantt" ? <WbsGantt key={courseId} items={sortedItems} webinarDate={webinarDate} todayDate={today} /> : view === "compact" ? (
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
                    <td className={`px-4 py-3 font-medium ${item.completed ? "text-muted-foreground line-through" : ""}`}>{item.title || "—"}</td>
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
                          <Input value={item.title} onChange={(event) => editItem(item.id, { title: event.target.value })} placeholder="업무 제목" aria-label={`${index + 1}번째 업무 제목`} className={item.completed ? "line-through" : ""} disabled={saving || item.id === WEBINAR_ITEM_ID} />
                          {item.id === WEBINAR_ITEM_ID ? <p className="mt-1 text-xs text-muted-foreground">날짜는 강의 상세의 무료웨비나 일정과 연결됩니다.</p> : null}
                          <Textarea value={item.description ?? ""} onChange={(event) => editItem(item.id, { description: event.target.value })} placeholder="업무 설명 또는 세부 체크 내용" aria-label={`${index + 1}번째 업무 설명`} rows={2} className="mt-2 min-h-14 resize-y text-xs" disabled={saving} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><PeoplePicker value={item.owner} people={ownerPeople} disabled={saving} label={`${index + 1}번째 담당자`} onChange={(value) => editItem(item.id, { owner: value })} /></td>
                    <td className="px-3 py-3"><PeoplePicker value={item.stakeholders} people={people} disabled={saving} label={`${index + 1}번째 관계자`} onChange={(value) => editItem(item.id, { stakeholders: value })} /></td>
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
          {dirty && !loadingWbs ? <div className="mt-4 flex justify-end"><Button onClick={() => void saveWbs()} disabled={saving}><Save /> 강의 WBS 저장</Button></div> : null}
      </section>
    </>}
  </div>;
}
