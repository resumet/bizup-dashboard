"use client";

import Link from "next/link";
import {
  CalendarCheck2,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  NotebookPen,
  PackagePlus,
  PlaneTakeoff,
  Plus,
  Send,
  StickyNote,
  Trash2,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  EXECUTIVE_ASSIGNMENT_STATUS_LABELS,
  findActiveMention,
  insertMention,
  type ActiveMention,
} from "@/lib/personal-dashboard/tasks";
import type {
  ExecutiveAssignment,
  PersonalDashboardMemo,
  PersonalDashboardPerson,
} from "@/lib/personal-dashboard/types";
import { cn } from "@/lib/utils";

const WORK_MENU_ITEMS: Array<{
  label: string;
  href: string;
  icon: LucideIcon;
  className: string;
}> = [
  { label: "근태관리", href: "/hr/leave", icon: CalendarCheck2, className: "bg-blue-50 text-blue-700" },
  { label: "업무기록", href: "/hr", icon: NotebookPen, className: "bg-violet-50 text-violet-700" },
  { label: "출장보고", href: "/services/business-trip-reports", icon: PlaneTakeoff, className: "bg-rose-50 text-rose-700" },
  { label: "비품신청", href: "/hr/supplies", icon: PackagePlus, className: "bg-amber-50 text-amber-800" },
];

const STATUS_CLASS_NAMES = {
  created: "bg-slate-100 text-slate-700",
  assigned: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
} as const;

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  return body as T;
}

function dateTimeLabel(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ErrorMessage({ children }: { children: string }) {
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: string }) {
  return (
    <CardTitle className="flex items-center gap-2 text-lg">
      <Icon className="size-5 text-blue-700" aria-hidden="true" />
      {children}
    </CardTitle>
  );
}
export function PersonalDashboard({
  userId,
  userName,
  isSuperAdmin,
  initialMemos,
  initialAssignments,
  people,
}: {
  userId: string;
  userName: string;
  isSuperAdmin: boolean;
  initialMemos: PersonalDashboardMemo[];
  initialAssignments: ExecutiveAssignment[];
  people: PersonalDashboardPerson[];
}) {
  const assignmentInputRef = useRef<HTMLTextAreaElement>(null);
  const [memos, setMemos] = useState(initialMemos);
  const [memoDraft, setMemoDraft] = useState("");
  const [assignments, setAssignments] = useState(initialAssignments);
  const [assignmentText, setAssignmentText] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState<PersonalDashboardPerson | null>(null);
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [highlightedPersonIndex, setHighlightedPersonIndex] = useState(0);
  const [completionTaskId, setCompletionTaskId] = useState<string | null>(null);
  const [completionReport, setCompletionReport] = useState("");
  const [busy, setBusy] = useState("");
  const [memoError, setMemoError] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [taskError, setTaskError] = useState("");

  const mentionSuggestions = useMemo(() => {
    if (!activeMention) return [];
    const query = activeMention.query.trim().toLocaleLowerCase("ko-KR");
    return people
      .filter((person) => !query || person.name.toLocaleLowerCase("ko-KR").includes(query));
  }, [activeMention, people]);
  const myAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.assignee_id === userId),
    [assignments, userId],
  );
  const completionTask = completionTaskId
    ? assignments.find((assignment) => assignment.id === completionTaskId) ?? null
    : null;

  async function createMemo(event: FormEvent) {
    event.preventDefault();
    if (!memoDraft.trim() || busy) return;
    setBusy("memo-create");
    setMemoError("");
    try {
      const memo = await readJson<PersonalDashboardMemo>(await fetch("/api/personal-dashboard/memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: memoDraft }),
      }));
      setMemos((current) => [memo, ...current]);
      setMemoDraft("");
    } catch (error) {
      setMemoError(error instanceof Error ? error.message : "메모를 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function deleteMemo(id: string) {
    if (busy) return;
    setBusy(`memo-${id}`);
    setMemoError("");
    try {
      const response = await fetch(`/api/personal-dashboard/memos/${id}`, { method: "DELETE" });
      if (!response.ok) await readJson(response);
      setMemos((current) => current.filter((memo) => memo.id !== id));
    } catch (error) {
      setMemoError(error instanceof Error ? error.message : "메모를 삭제하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  function updateAssignmentText(value: string, cursor: number) {
    setAssignmentText(value);
    setActiveMention(findActiveMention(value, cursor));
    setHighlightedPersonIndex(0);
    if (selectedAssignee && !value.includes(`@${selectedAssignee.name}`)) setSelectedAssignee(null);
  }

  function choosePerson(person: PersonalDashboardPerson) {
    if (!activeMention) return;
    const inserted = insertMention(assignmentText, activeMention, person.name);
    setAssignmentText(inserted.value);
    setSelectedAssignee(person);
    setActiveMention(null);
    requestAnimationFrame(() => {
      assignmentInputRef.current?.focus();
      assignmentInputRef.current?.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  }

  function moveHighlightedPerson(direction: 1 | -1) {
    if (!mentionSuggestions.length) return;
    const nextIndex = (
      highlightedPersonIndex + direction + mentionSuggestions.length
    ) % mentionSuggestions.length;
    const nextPerson = mentionSuggestions[nextIndex];
    setHighlightedPersonIndex(nextIndex);
    requestAnimationFrame(() => {
      document.getElementById(`assignment-person-${nextPerson.id}`)?.scrollIntoView({
        block: "nearest",
      });
    });
  }

  function handleAssignmentKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (activeMention && mentionSuggestions.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveHighlightedPerson(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveHighlightedPerson(-1);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        choosePerson(mentionSuggestions[highlightedPersonIndex] ?? mentionSuggestions[0]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveMention(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void createAssignment();
    }
  }

  async function createAssignment(event?: FormEvent) {
    event?.preventDefault();
    if (!assignmentText.trim() || !selectedAssignee || busy) {
      if (!selectedAssignee) setAssignmentError("@를 입력해 목록에서 담당자를 선택해 주세요.");
      return;
    }
    setBusy("assignment-create");
    setAssignmentError("");
    try {
      const assignment = await readJson<ExecutiveAssignment>(await fetch("/api/personal-dashboard/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: assignmentText, assigneeId: selectedAssignee.id }),
      }));
      setAssignments((current) => [assignment, ...current]);
      setAssignmentText("");
      setSelectedAssignee(null);
      setActiveMention(null);
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "할일을 배정하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  function openCompletionDialog(assignment: ExecutiveAssignment) {
    setCompletionTaskId(assignment.id);
    setCompletionReport(assignment.completion_report);
    setTaskError("");
  }

  async function saveAssignmentStatus(
    assignment: ExecutiveAssignment,
    status: "assigned" | "completed",
    report = assignment.completion_report,
  ) {
    if (busy) return;
    setBusy(`task-${assignment.id}`);
    setTaskError("");
    try {
      const updated = await readJson<ExecutiveAssignment>(await fetch(`/api/personal-dashboard/tasks/${assignment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, completionReport: report }),
      }));
      setAssignments((current) => current.map((item) => (
        item.id === assignment.id ? { ...item, ...updated } : item
      )));
      setCompletionTaskId(null);
      setCompletionReport("");
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "할일 상태를 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="min-h-dvh bg-slate-50/70">
      <div className="mx-auto max-w-[1500px] space-y-6 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">{userName}님의 개인 대시보드</h1>

        <section aria-labelledby="work-menu-title">
          <h2 id="work-menu-title" className="sr-only">업무 메뉴</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {WORK_MENU_ITEMS.map(({ label, href, icon: Icon, className }) => (
              <Link key={href} href={href} className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
                <Card className="h-full py-0 transition-colors group-hover:border-blue-300 group-hover:bg-blue-50/20">
                  <CardContent className="flex min-h-24 items-center gap-4 p-5">
                    <span className={cn("grid size-11 place-items-center rounded-xl", className)}>
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <strong>{label}</strong>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {isSuperAdmin ? (
          <Card className="relative z-30 overflow-visible border-blue-200 bg-white shadow-sm">
            <CardHeader>
              <SectionTitle icon={Send}>할일 배정</SectionTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={(event) => void createAssignment(event)}>
                <div className="relative">
                  <Textarea
                    ref={assignmentInputRef}
                    value={assignmentText}
                    maxLength={5000}
                    rows={3}
                    placeholder="@사용자 할일을 입력하세요"
                    aria-label="사용자에게 배정할 할일"
                    aria-autocomplete="list"
                    aria-controls={activeMention ? "assignment-people" : undefined}
                    aria-activedescendant={activeMention && mentionSuggestions.length
                      ? `assignment-person-${mentionSuggestions[highlightedPersonIndex]?.id ?? mentionSuggestions[0].id}`
                      : undefined}
                    onChange={(event) => updateAssignmentText(event.target.value, event.target.selectionStart)}
                    onClick={(event) => {
                      setActiveMention(findActiveMention(event.currentTarget.value, event.currentTarget.selectionStart));
                      setHighlightedPersonIndex(0);
                    }}
                    onKeyDown={handleAssignmentKeyDown}
                  />
                  {activeMention ? (
                    <div id="assignment-people" role="listbox" aria-label="할일 담당자" className="absolute inset-x-0 top-full z-50 mt-2 max-h-80 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl ring-1 ring-black/5">
                      {mentionSuggestions.length ? mentionSuggestions.map((person, index) => (
                        <button
                          key={person.id}
                          id={`assignment-person-${person.id}`}
                          type="button"
                          role="option"
                          aria-selected={index === highlightedPersonIndex}
                          className={cn(
                            "flex min-h-11 w-full scroll-my-1 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:bg-blue-700 focus-visible:text-white focus-visible:outline-none",
                            index === highlightedPersonIndex
                              ? "bg-blue-700 text-white shadow-sm"
                              : "text-slate-900 hover:bg-slate-100",
                          )}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setHighlightedPersonIndex(index)}
                          onClick={() => choosePerson(person)}
                        >
                          <UserRoundCheck className="size-4" aria-hidden="true" />
                          {person.name}
                        </button>
                      )) : (
                        <p className="px-3 py-4 text-center text-sm text-muted-foreground">일치하는 사용자가 없습니다.</p>
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">@ 입력 후 방향키와 Enter로 담당자를 선택할 수 있습니다.</p>
                  <Button type="submit" disabled={!assignmentText.trim() || !selectedAssignee || busy === "assignment-create"}>
                    {busy === "assignment-create" ? <Loader2 className="animate-spin" /> : <Send />}
                    배정하기
                  </Button>
                </div>
                {assignmentError ? <ErrorMessage>{assignmentError}</ErrorMessage> : null}
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card className="bg-white shadow-sm">
          <CardHeader>
            <SectionTitle icon={StickyNote}>메모 목록</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-2" onSubmit={(event) => void createMemo(event)}>
              <Textarea
                value={memoDraft}
                maxLength={2000}
                rows={3}
                placeholder="기억할 내용을 적어 주세요"
                aria-label="새 개인 메모"
                onChange={(event) => setMemoDraft(event.target.value)}
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={!memoDraft.trim() || busy === "memo-create"}>
                  {busy === "memo-create" ? <Loader2 className="animate-spin" /> : <Plus />}
                  메모 추가
                </Button>
              </div>
            </form>
            {memoError ? <ErrorMessage>{memoError}</ErrorMessage> : null}
            <div className="space-y-2">
              {memos.length ? memos.map((memo) => (
                <article key={memo.id} className="flex items-start gap-3 rounded-xl border bg-slate-50/70 p-3.5">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-6">{memo.content}</p>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="메모 삭제"
                    disabled={busy === `memo-${memo.id}`}
                    onClick={() => void deleteMemo(memo.id)}
                  >
                    {busy === `memo-${memo.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                </article>
              )) : (
                <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">저장된 메모가 없습니다.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white shadow-sm">
          <CardHeader>
            <SectionTitle icon={ClipboardList}>할일 목록</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {taskError ? <ErrorMessage>{taskError}</ErrorMessage> : null}
            {myAssignments.length ? myAssignments.map((assignment) => {
              const completed = assignment.status === "completed";
              const changing = busy === `task-${assignment.id}`;
              return (
                <article key={assignment.id} className={cn("rounded-xl border p-4", completed ? "bg-emerald-50/40" : "bg-white")}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-0.5 size-5"
                      checked={completed}
                      disabled={changing}
                      aria-label={`${assignment.title} ${completed ? "완료 취소" : "완료"}`}
                      onCheckedChange={(checked) => {
                        if (checked === true) openCompletionDialog(assignment);
                        else void saveAssignmentStatus(assignment, "assigned");
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className={cn("break-words", completed && "text-muted-foreground line-through")}>{assignment.title}</strong>
                        <Badge variant="secondary" className={STATUS_CLASS_NAMES[assignment.status]}>
                          {EXECUTIVE_ASSIGNMENT_STATUS_LABELS[assignment.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{assignment.creator_name} · {dateTimeLabel(assignment.created_at)} 배정</p>
                      {completed ? (
                        <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-medium text-emerald-800">완료 보고 · {dateTimeLabel(assignment.completed_at)}</span>
                            <Button type="button" size="xs" variant="ghost" onClick={() => openCompletionDialog(assignment)}>보고 수정</Button>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{assignment.completion_report || "보고 내용 없음"}</p>
                        </div>
                      ) : null}
                    </div>
                    {changing ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="저장 중" /> : null}
                  </div>
                </article>
              );
            }) : (
              <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">배정된 할일이 없습니다.</p>
            )}
          </CardContent>
        </Card>

        {isSuperAdmin ? (
          <Card className="bg-white shadow-sm">
            <CardHeader>
              <SectionTitle icon={FileText}>배정 현황</SectionTitle>
            </CardHeader>
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">담당자</TableHead>
                      <TableHead>할일</TableHead>
                      <TableHead>배정일</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>완료일</TableHead>
                      <TableHead className="pr-6">완료 보고</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.length ? assignments.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell className="pl-6 font-medium">{assignment.assignee_name}</TableCell>
                        <TableCell className="min-w-64 whitespace-normal">{assignment.title}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{dateTimeLabel(assignment.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STATUS_CLASS_NAMES[assignment.status]}>
                            {EXECUTIVE_ASSIGNMENT_STATUS_LABELS[assignment.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{dateTimeLabel(assignment.completed_at)}</TableCell>
                        <TableCell className="max-w-96 whitespace-pre-wrap break-words pr-6 text-muted-foreground">{assignment.completion_report || "-"}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">배정한 할일이 없습니다.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={Boolean(completionTask)} onOpenChange={(open) => {
        if (!open && !busy) {
          setCompletionTaskId(null);
          setCompletionReport("");
          setTaskError("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>할일 완료</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="font-medium">{completionTask?.title}</p>
            <Textarea
              value={completionReport}
              maxLength={5000}
              rows={6}
              placeholder="완료한 내용이나 결과를 기록해 주세요"
              aria-label="완료 보고"
              onChange={(event) => setCompletionReport(event.target.value)}
            />
            <p className="text-right text-xs text-muted-foreground">{Array.from(completionReport).length.toLocaleString("ko-KR")} / 5,000자</p>
            {taskError ? <ErrorMessage>{taskError}</ErrorMessage> : null}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={Boolean(busy)}>취소</Button></DialogClose>
            <Button
              type="button"
              disabled={!completionTask || busy === `task-${completionTask?.id}`}
              onClick={() => completionTask && void saveAssignmentStatus(completionTask, "completed", completionReport)}
            >
              {busy === `task-${completionTask?.id}` ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              완료 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
