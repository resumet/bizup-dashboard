"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Ellipsis,
  Grid2X2,
  List,
  Loader2,
  Trash2,
} from "lucide-react";

import { CourseListCalendar } from "@/components/course-operations/course-list-calendar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CourseSummary } from "@/lib/course-operations/types";
import { courseBannerUrl } from "@/lib/course-operations/banner";
import { partitionCoursesByWebinarStatus } from "@/lib/course-operations/course-list-status";
import { sortByFarthestWebinar } from "@/lib/course-operations/webinar-proximity";

type ViewMode = "cards" | "list" | "calendar";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function CourseSectionHeading({ title, count }: { title: string; count: number }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <h2 className="text-xl font-semibold">{title}</h2>
    <Badge variant="secondary">{count}개</Badge>
  </div>;
}

function CourseActionsMenu({
  course,
  canDelete,
  onDelete,
}: {
  course: CourseSummary;
  canDelete: boolean;
  onDelete: (course: CourseSummary) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${course.name} 작업 메뉴`}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          variant="destructive"
          disabled={!canDelete}
          onSelect={() => onDelete(course)}
        >
          <Trash2 />
          삭제
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CourseCards({ courses, canDelete, onDelete, completed = false }: {
  courses: CourseSummary[];
  canDelete: boolean;
  onDelete: (course: CourseSummary) => void;
  completed?: boolean;
}) {
  if (!courses.length) return <div className="rounded-xl border border-dashed bg-background px-5 py-10 text-center text-sm text-muted-foreground">표시할 강의가 없습니다.</div>;
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{courses.map((course, index) => (
    <Card key={course.id} className={`overflow-hidden transition-shadow hover:shadow-md ${completed ? "bg-muted/35" : ""}`}>
      {course.banner_image_path ? <Link href={`/services/course-operations/${course.id}`} className={`relative -mt-4 block aspect-video overflow-hidden bg-muted ${completed ? "grayscale-[35%]" : ""}`} aria-label={`${course.name} 강의 배너로 상세보기`}>
        <Image src={courseBannerUrl(course.id, course.updated_at)} alt={`${course.name} 배너`} fill unoptimized loading={index < 2 && !completed ? "eager" : "lazy"} priority={index < 2 && !completed} sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-300 group-hover/card:scale-[1.02]" />
      </Link> : null}
      <CardHeader>
        <CardTitle className="line-clamp-2 min-h-14 pt-3 text-xl leading-7" title={course.name}>
          <Link href={`/services/course-operations/${course.id}`} className="hover:underline">
            {course.name}
          </Link>
        </CardTitle>
        <p className="truncate text-sm text-muted-foreground" title={`${course.cohort ? `${course.cohort}기 / ` : ""}${course.instructor_name}`}>{course.cohort ? `${course.cohort}기 / ` : ""}{course.instructor_name}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 border-t pt-5">
        <p className="flex items-center gap-2 text-sm"><CalendarDays className="size-4 text-muted-foreground" />무료 웨비나 {formatDate(course.free_webinar_at)}</p>
        <div className="mt-auto flex justify-end">
          <CourseActionsMenu course={course} canDelete={canDelete} onDelete={onDelete} />
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
      <TableHeader><TableRow><TableHead>강의명</TableHead><TableHead>강사명</TableHead><TableHead>무료 웨비나</TableHead><TableHead className="w-16 text-right">관리</TableHead></TableRow></TableHeader>
      <TableBody>{courses.map((course) => <TableRow key={course.id} className={completed ? "text-muted-foreground" : ""}>
        <TableCell className="font-medium"><Link href={`/services/course-operations/${course.id}`} className="hover:underline">{course.name}</Link></TableCell>
        <TableCell>{course.instructor_name}</TableCell><TableCell>{formatDate(course.free_webinar_at)}</TableCell>
        <TableCell className="text-right"><CourseActionsMenu course={course} canDelete={canDelete} onDelete={onDelete} /></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </Card>;
}

export function CourseOperationsList({
  courses,
  canDelete,
  todayKoreaDate,
}: {
  courses: CourseSummary[];
  canDelete: boolean;
  todayKoreaDate: string;
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [deleteTarget, setDeleteTarget] = useState<CourseSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const { ongoing: ongoingCourses, completed: completedCourses } = useMemo(
    () => partitionCoursesByWebinarStatus(courses, todayKoreaDate),
    [courses, todayKoreaDate],
  );
  const cardOngoingCourses = useMemo(() => sortByFarthestWebinar(ongoingCourses), [ongoingCourses]);
  const cardCompletedCourses = useMemo(() => sortByFarthestWebinar(completedCourses), [completedCourses]);

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

  return (
    <>
      <div className="mb-5 flex justify-end">
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
          <section aria-label="진행 중 강의"><CourseSectionHeading title="진행 중" count={cardOngoingCourses.length} /><CourseCards courses={cardOngoingCourses} canDelete={canDelete} onDelete={openDeleteDialog} /></section>
          <section aria-label="완료된 강의"><CourseSectionHeading title="완료" count={cardCompletedCourses.length} /><CourseCards courses={cardCompletedCourses} canDelete={canDelete} onDelete={openDeleteDialog} completed /></section>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-10">
          <section aria-label="진행 중 강의"><CourseSectionHeading title="진행 중" count={ongoingCourses.length} /><CourseTable courses={ongoingCourses} canDelete={canDelete} onDelete={openDeleteDialog} /></section>
          <section aria-label="완료된 강의"><CourseSectionHeading title="완료" count={completedCourses.length} /><CourseTable courses={completedCourses} canDelete={canDelete} onDelete={openDeleteDialog} completed /></section>
        </div>
      ) : (
        <div className="space-y-10"><section aria-label="진행 중 강의 일정"><CourseSectionHeading title="진행 중" count={ongoingCourses.length} />{ongoingCourses.length ? <CourseListCalendar courses={ongoingCourses} /> : <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">진행 중인 강의가 없습니다.</div>}</section><section aria-label="완료된 강의"><CourseSectionHeading title="완료" count={completedCourses.length} /><CourseTable courses={completedCourses} canDelete={canDelete} onDelete={openDeleteDialog} completed /></section></div>
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
