"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  BellRing,
  CalendarDays,
  CircleCheck,
  Grid2X2,
  List,
  Loader2,
  Settings2,
  Trash2,
  Users,
  CircleDollarSign,
} from "lucide-react";

import { CourseListCalendar } from "@/components/course-operations/course-list-calendar";
import { CoursePaymentSummaryTable } from "@/components/course-operations/course-payment-summary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CourseSummary } from "@/lib/course-operations/types";
import type { CoursePaymentSummary } from "@/lib/course-operations/payment-summary";
import type { CoursePaidStudentSummary } from "@/lib/course-operations/paid-student-summary";
import { courseBannerUrl } from "@/lib/course-operations/banner";
import { getCourseMissingItems, partitionCoursesByWebinarStatus } from "@/lib/course-operations/course-list-status";
import { sortByFarthestWebinar } from "@/lib/course-operations/webinar-proximity";

type ViewMode = "cards" | "list" | "calendar" | "payments" | "students";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function CourseSectionHeading({ title, description, count }: { title: string; description: string; count: number }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
    <Badge variant="secondary">{count}개</Badge>
  </div>;
}

function CourseCards({ courses, canDelete, onDelete, completed = false }: {
  courses: CourseSummary[];
  canDelete: boolean;
  onDelete: (course: CourseSummary) => void;
  completed?: boolean;
}) {
  if (!courses.length) return <div className="rounded-xl border border-dashed bg-background px-5 py-10 text-center text-sm text-muted-foreground">표시할 강의가 없습니다.</div>;
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{courses.map((course, index) => (
    <Card key={course.id} className={`min-h-[29rem] overflow-hidden transition-shadow hover:shadow-md ${completed ? "bg-muted/35" : ""}`}>
      {course.banner_image_path ? <Link href={`/services/course-operations/${course.id}`} className={`relative -mt-4 block aspect-video overflow-hidden bg-muted ${completed ? "grayscale-[35%]" : ""}`} aria-label={`${course.name} 강의 배너로 상세보기`}>
        <Image src={courseBannerUrl(course.id, course.updated_at)} alt={`${course.name} 배너`} fill unoptimized loading={index < 2 && !completed ? "eager" : "lazy"} priority={index < 2 && !completed} sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-300 group-hover/card:scale-[1.02]" />
      </Link> : null}
      <CardHeader>
        <div className="hidden"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpenCheck className="size-5" /></span><Badge variant="secondary">옵션 {course.course_options.length}개</Badge></div>
        <CardTitle className="line-clamp-2 min-h-14 pt-3 text-xl leading-7" title={course.name}>{course.name}</CardTitle>
        <p className="truncate text-sm text-muted-foreground" title={`${course.cohort ? `${course.cohort}기 / ` : ""}${course.instructor_name}`}>{course.cohort ? `${course.cohort}기 / ` : ""}{course.instructor_name}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 border-t pt-5">
        <p className="flex items-center gap-2 text-sm"><CalendarDays className="size-4 text-muted-foreground" />무료 웨비나 {formatDate(course.free_webinar_at)}</p>
        <div className="mt-auto grid grid-cols-[1fr_auto] gap-2">
          <Button asChild><Link href={`/services/course-operations/${course.id}`}><Settings2 />운영 정보 보기</Link></Button>
          <Button variant="outline" className="text-destructive hover:text-destructive" disabled={!canDelete} onClick={() => onDelete(course)} aria-label={`${course.name} 삭제`}><Trash2 /></Button>
        </div>
      </CardContent>
    </Card>
  ))}</div>;
}

function CourseTable({ courses, canDelete, onDelete, completed = false }: {
  courses: CourseSummary[];
  canDelete: boolean;
  onDelete: (course: CourseSummary) => void;
  completed?: boolean;
}) {
  if (!courses.length) return <div className="rounded-xl border border-dashed bg-background px-5 py-10 text-center text-sm text-muted-foreground">표시할 강의가 없습니다.</div>;
  return <Card className={`overflow-hidden ${completed ? "bg-muted/35" : ""}`}>
    <Table>
      <TableHeader><TableRow><TableHead>강의명</TableHead><TableHead>강사명</TableHead><TableHead>무료 웨비나</TableHead><TableHead>개강</TableHead><TableHead>연결 정보</TableHead><TableHead className="text-right">관리</TableHead></TableRow></TableHeader>
      <TableBody>{courses.map((course) => <TableRow key={course.id} className={completed ? "text-muted-foreground" : ""}>
        <TableCell className="font-medium"><Link href={`/services/course-operations/${course.id}`} className="hover:underline">{course.name}</Link></TableCell>
        <TableCell>{course.instructor_name}</TableCell><TableCell>{formatDate(course.free_webinar_at)}</TableCell><TableCell>{formatDate(course.starts_at)}</TableCell>
        <TableCell><div className="flex flex-wrap gap-1.5"><Badge variant="outline">옵션 {course.course_options.length}개</Badge><Badge variant="outline">명단 {course.course_jobs.length}개</Badge><Badge variant="outline">문자 {course.message_studio_projects.length}개</Badge></div></TableCell>
        <TableCell><div className="flex justify-end gap-2"><Button variant="outline" size="sm" asChild><Link href={`/services/course-operations/${course.id}`}><Settings2 />보기</Link></Button><Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={!canDelete} onClick={() => onDelete(course)}><Trash2 />삭제</Button></div></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </Card>;
}

export function CourseOperationsList({
  courses,
  canDelete,
  paymentSummaries = [],
  todayKoreaDate,
}: {
  courses: CourseSummary[];
  canDelete: boolean;
  paymentSummaries?: CoursePaymentSummary[];
  todayKoreaDate: string;
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [deleteTarget, setDeleteTarget] = useState<CourseSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [loadedPaymentSummaries, setLoadedPaymentSummaries] = useState(paymentSummaries);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paidStudentSummaries, setPaidStudentSummaries] = useState<CoursePaidStudentSummary[] | null>(null);
  const [paidStudentLoading, setPaidStudentLoading] = useState(false);
  const [paidStudentError, setPaidStudentError] = useState("");
  const { ongoing: ongoingCourses, completed: completedCourses } = useMemo(
    () => partitionCoursesByWebinarStatus(courses, todayKoreaDate),
    [courses, todayKoreaDate],
  );
  const cardOngoingCourses = useMemo(() => sortByFarthestWebinar(ongoingCourses), [ongoingCourses]);
  const cardCompletedCourses = useMemo(() => sortByFarthestWebinar(completedCourses), [completedCourses]);
  const courseAlerts = useMemo(() => ongoingCourses.map((course) => ({ course, items: getCourseMissingItems(course) })).filter(({ items }) => items.length), [ongoingCourses]);
  const missingItemCount = courseAlerts.reduce((sum, alert) => sum + alert.items.length, 0);
  const paidStudentCounts = useMemo(
    () => new Map((paidStudentSummaries ?? []).map((summary) => [summary.course_id, summary.paid_student_count])),
    [paidStudentSummaries],
  );

  async function deleteCourse() {
    if (!canDelete || !deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(
        `/api/course-operations/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message || "강의 삭제에 실패했습니다.");
      }
      setDeleteTarget(null);
      router.refresh();
    } catch (caught) {
      setDeleteError(
        caught instanceof Error ? caught.message : "강의 삭제에 실패했습니다.",
      );
    } finally {
      setDeleting(false);
    }
  }

  function openDeleteDialog(course: CourseSummary) {
    setDeleteError("");
    setDeleteTarget(course);
  }

  async function openPayments() {
    setViewMode("payments");
    if (loadedPaymentSummaries.length || paymentLoading) return;
    setPaymentLoading(true);
    try {
      const response = await fetch("/api/course-operations/payment-summary", { cache: "no-store" });
      if (!response.ok) throw new Error("결제내역을 불러오지 못했습니다.");
      setLoadedPaymentSummaries(await response.json());
    } finally { setPaymentLoading(false); }
  }

  async function openPaidStudents() {
    setViewMode("students");
    if (paidStudentSummaries || paidStudentLoading) return;
    setPaidStudentLoading(true);
    setPaidStudentError("");
    try {
      const response = await fetch("/api/course-operations/paid-student-summary", { cache: "no-store" });
      if (!response.ok) throw new Error("유료수강생 인원을 불러오지 못했습니다.");
      setPaidStudentSummaries(await response.json());
    } catch (caught) {
      setPaidStudentError(caught instanceof Error ? caught.message : "유료수강생 인원을 불러오지 못했습니다.");
    } finally {
      setPaidStudentLoading(false);
    }
  }

  return (
    <>
      <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900 dark:bg-amber-950/20" aria-label="진행 중 강의 입력 알림">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3"><span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"><BellRing className="size-4" /></span><div><h2 className="font-semibold">진행 중 강의 알림</h2><p className="mt-1 text-sm text-muted-foreground">현재 진행 중인 강의에서 채우거나 완료해야 할 운영 항목을 확인하세요.</p></div></div>
          <Badge variant="outline" className="bg-background/70">{missingItemCount}개 항목</Badge>
        </div>
        {courseAlerts.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{courseAlerts.map(({ course, items }) => <Link key={course.id} href={`/services/course-operations/${course.id}`} className="rounded-lg border bg-background/85 p-4 transition-colors hover:border-amber-400 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{course.name}</p><p className="mt-1 text-xs text-muted-foreground">{course.cohort ? `${course.cohort}기 · ` : ""}{course.instructor_name} · 웨비나 {formatDate(course.free_webinar_at)}</p></div><Badge className="shrink-0 bg-amber-600 text-white hover:bg-amber-600">{items.length}개</Badge></div>
          <div className="mt-3 flex flex-wrap gap-1.5">{items.map((item) => <span key={item.key} className="rounded-md border bg-muted/50 px-2 py-1 text-xs text-muted-foreground">{item.label}</span>)}</div>
        </Link>)}</div> : <div className="mt-4 flex items-center gap-2 rounded-lg border bg-background/80 px-4 py-5 text-sm text-emerald-700 dark:text-emerald-300"><CircleCheck className="size-4" />진행 중 강의의 필수 운영 항목이 모두 채워져 있습니다.</div>}
      </section>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex self-start rounded-lg border bg-background p-1" aria-label="강의 운영 자료">
          <Button
            type="button"
            variant={viewMode === "students" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => void openPaidStudents()}
            aria-pressed={viewMode === "students"}
          >
            <Users />
            유료수강생
          </Button>
          <Button
            type="button"
            variant={viewMode === "payments" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => void openPayments()}
            aria-pressed={viewMode === "payments"}
          >
            <CircleDollarSign />
            전체 결제내역
          </Button>
        </div>
        <div className="inline-flex self-start rounded-lg border bg-background p-1 sm:self-auto" aria-label="강의 목록 보기 방식">
          <Button
            type="button"
            variant={viewMode === "cards" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("cards")}
            aria-pressed={viewMode === "cards"}
          >
            <Grid2X2 />
            카드
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
          >
            <List />
            리스트
          </Button>
          <Button
            type="button"
            variant={viewMode === "calendar" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("calendar")}
            aria-pressed={viewMode === "calendar"}
          >
            <CalendarDays />
            캘린더
          </Button>
        </div>
      </div>

      {viewMode === "cards" ? (
        <div className="space-y-10">
          <section aria-label="진행 중 강의"><CourseSectionHeading title="진행 중" description="웨비나 D+2까지의 현재 운영 강의입니다." count={cardOngoingCourses.length} /><CourseCards courses={cardOngoingCourses} canDelete={canDelete} onDelete={openDeleteDialog} /></section>
          <section aria-label="완료된 강의"><CourseSectionHeading title="완료" description="무료 웨비나가 끝난 지 3일 이상 지난 강의입니다." count={cardCompletedCourses.length} /><CourseCards courses={cardCompletedCourses} canDelete={canDelete} onDelete={openDeleteDialog} completed /></section>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-10">
          <section aria-label="진행 중 강의"><CourseSectionHeading title="진행 중" description="웨비나 D+2까지의 현재 운영 강의입니다." count={ongoingCourses.length} /><CourseTable courses={ongoingCourses} canDelete={canDelete} onDelete={openDeleteDialog} /></section>
          <section aria-label="완료된 강의"><CourseSectionHeading title="완료" description="무료 웨비나가 끝난 지 3일 이상 지난 강의입니다." count={completedCourses.length} /><CourseTable courses={completedCourses} canDelete={canDelete} onDelete={openDeleteDialog} completed /></section>
        </div>
      ) : viewMode === "students" ? (
        paidStudentLoading ? (
          <p className="py-12 text-center text-muted-foreground">유료수강생 인원을 불러오는 중입니다.</p>
        ) : paidStudentError ? (
          <Alert variant="destructive"><AlertTitle>유료수강생 인원을 불러오지 못했습니다</AlertTitle><AlertDescription>{paidStudentError}</AlertDescription></Alert>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>강의명</TableHead><TableHead>기수</TableHead><TableHead>강사명</TableHead><TableHead className="text-right">유료수강생</TableHead><TableHead className="text-right">관리</TableHead></TableRow></TableHeader>
              <TableBody>{courses.map((course) => <TableRow key={course.id}><TableCell className="font-medium"><Link href={`/services/course-operations/${course.id}`} className="hover:underline">{course.name}</Link></TableCell><TableCell>{course.cohort ? `${course.cohort}기` : "-"}</TableCell><TableCell>{course.instructor_name || "-"}</TableCell><TableCell className="text-right tabular-nums">{(paidStudentCounts.get(course.id) ?? 0).toLocaleString("ko-KR")}명</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" asChild><Link href={`/services/course-operations/${course.id}?tab=paid-students`}>명단 바로가기</Link></Button></TableCell></TableRow>)}</TableBody>
            </Table>
          </Card>
        )
      ) : viewMode === "calendar" ? (
        <div className="space-y-10"><section aria-label="진행 중 강의 일정"><CourseSectionHeading title="진행 중" description="완료되지 않은 강의 일정만 달력에 표시합니다." count={ongoingCourses.length} />{ongoingCourses.length ? <CourseListCalendar courses={ongoingCourses} /> : <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">진행 중인 강의가 없습니다.</div>}</section><section aria-label="완료된 강의"><CourseSectionHeading title="완료" description="무료 웨비나가 끝난 지 3일 이상 지난 강의입니다." count={completedCourses.length} /><CourseTable courses={completedCourses} canDelete={canDelete} onDelete={openDeleteDialog} completed /></section></div>
      ) : (
        <>{paymentLoading ? <p className="py-12 text-center text-muted-foreground">결제내역을 불러오는 중입니다.</p> : <CoursePaymentSummaryTable summaries={loadedPaymentSummaries} />}</>
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(openState) => {
          if (!openState && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>강의를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              &apos;{deleteTarget?.name}&apos;의 강의 정보와 옵션, 유튜브 출연
              정보가 삭제됩니다. 연결된 수강생 명단과 문자 제작물은 삭제되지
              않고 강의 연결만 해제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert variant="destructive">
              <AlertTitle>강의를 삭제할 수 없습니다</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting || !canDelete}
              onClick={(event) => {
                event.preventDefault();
                void deleteCourse();
              }}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {deleting ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
