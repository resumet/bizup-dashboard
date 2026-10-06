"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  ChevronDown,
  CircleDot,
  EllipsisVertical,
  Grid2X2,
  List,
  Loader2,
  Plus,
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
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { partitionCoursesByStatus } from "@/lib/course-operations/course-list-status";
import {
  COURSE_STATUSES,
  COURSE_STATUS_LABELS,
  isCourseStatus,
  type CourseStatus,
} from "@/lib/course-operations/course-status";
import {
  sortByFarthestWebinar,
  sortByNearestWebinar,
} from "@/lib/course-operations/webinar-proximity";

type ViewMode = "cards" | "list" | "calendar";
type CollapsibleCourseStatus = Exclude<CourseStatus, "ongoing">;

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
  onStatus,
  onDelete,
}: {
  course: CourseSummary;
  canDelete: boolean;
  onStatus: (course: CourseSummary) => void;
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
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onStatus(course)}>
          <CircleDot />
          상태
          <span className="ml-auto text-xs text-muted-foreground">
            {COURSE_STATUS_LABELS[course.status]}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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

function CourseCards({ courses, canDelete, onStatus, onDelete, subdued = false }: {
  courses: CourseSummary[];
  canDelete: boolean;
  onStatus: (course: CourseSummary) => void;
  onDelete: (course: CourseSummary) => void;
  subdued?: boolean;
}) {
  if (!courses.length) return <div className="rounded-xl border border-dashed bg-background px-5 py-10 text-center text-sm text-muted-foreground">표시할 강의가 없습니다.</div>;
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{courses.map((course, index) => (
    <Card key={course.id} className={`relative overflow-hidden transition-shadow hover:shadow-md ${subdued ? "bg-muted/35" : ""}`}>
      <div className="absolute right-2 top-2 z-10 rounded-md bg-background/90 shadow-sm backdrop-blur-sm">
        <CourseActionsMenu course={course} canDelete={canDelete} onStatus={onStatus} onDelete={onDelete} />
      </div>
      {course.banner_image_path ? <Link href={`/services/course-operations/${course.id}`} className={`relative -mt-4 block aspect-video overflow-hidden bg-muted ${subdued ? "grayscale-[35%]" : ""}`} aria-label={`${course.name} 강의 배너로 상세보기`}>
        <Image src={courseBannerUrl(course.id, course.updated_at)} alt={`${course.name} 배너`} fill unoptimized loading={index < 2 && !subdued ? "eager" : "lazy"} priority={index < 2 && !subdued} sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover transition-transform duration-300 group-hover/card:scale-[1.02]" />
      </Link> : null}
      <CardHeader className="pr-14">
        <CardTitle className="line-clamp-2 text-xl leading-7" title={course.name}>
          <Link href={`/services/course-operations/${course.id}`} className="hover:underline">
            {course.name}
          </Link>
        </CardTitle>
        <p className="truncate text-sm text-muted-foreground" title={`${course.cohort ? `${course.cohort}기` : "기수 미지정"} / ${course.instructor_name || "강사 미지정"} / ${formatDate(course.free_webinar_at)}`}>
          ({course.cohort ? `${course.cohort}기` : "기수 미지정"} / {course.instructor_name || "강사 미지정"} / {formatDate(course.free_webinar_at)})
        </p>
      </CardHeader>
    </Card>
  ))}</div>;
}

function CourseStatusSection({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={`${title} 강의`}>
      <Button
        type="button"
        variant="ghost"
        className="mb-4 h-auto gap-2 px-0 text-xl font-semibold hover:bg-transparent"
        aria-expanded={open}
        onClick={onToggle}
      >
        {title}
        <Badge variant="secondary">{count}개</Badge>
        <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open ? children : null}
    </section>
  );
}

function CourseTable({ courses, canDelete, onStatus, onDelete, subdued = false }: {
  courses: CourseSummary[];
  canDelete: boolean;
  onStatus: (course: CourseSummary) => void;
  onDelete: (course: CourseSummary) => void;
  subdued?: boolean;
}) {
  if (!courses.length) return <div className="rounded-xl border border-dashed bg-background px-5 py-10 text-center text-sm text-muted-foreground">표시할 강의가 없습니다.</div>;
  return <Card className={`overflow-hidden ${subdued ? "bg-muted/35" : ""}`}>
    <Table>
      <TableHeader><TableRow><TableHead>강사명</TableHead><TableHead>기수</TableHead><TableHead>강의명</TableHead><TableHead>웨비나 날짜</TableHead><TableHead className="w-16 text-right">관리</TableHead></TableRow></TableHeader>
      <TableBody>{courses.map((course) => <TableRow key={course.id} className={subdued ? "text-muted-foreground" : ""}>
        <TableCell className="font-medium">{course.instructor_name || "강사 미지정"}</TableCell>
        <TableCell>{course.cohort ? `${course.cohort}기` : "-"}</TableCell>
        <TableCell><Link href={`/services/course-operations/${course.id}`} className="font-medium hover:underline">{course.name}</Link></TableCell>
        <TableCell>{formatDate(course.free_webinar_at)}</TableCell>
        <TableCell className="text-right"><CourseActionsMenu course={course} canDelete={canDelete} onStatus={onStatus} onDelete={onDelete} /></TableCell>
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
  const [statusTarget, setStatusTarget] = useState<CourseSummary | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<CourseStatus>("ongoing");
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [openStatuses, setOpenStatuses] = useState<
    Record<CollapsibleCourseStatus, boolean>
  >({ on_hold: true, completed: false, canceled: false });
  const {
    ongoing: ongoingCourses,
    onHold: onHoldCourses,
    completed: completedCourses,
    canceled: canceledCourses,
  } = useMemo(
    () => partitionCoursesByStatus(courses),
    [courses],
  );
  const cardOngoingCourses = useMemo(() => sortByFarthestWebinar(ongoingCourses), [ongoingCourses]);
  const cardOnHoldCourses = useMemo(() => sortByFarthestWebinar(onHoldCourses), [onHoldCourses]);
  const cardCompletedCourses = useMemo(() => sortByFarthestWebinar(completedCourses), [completedCourses]);
  const cardCanceledCourses = useMemo(() => sortByFarthestWebinar(canceledCourses), [canceledCourses]);
  const listOngoingCourses = useMemo(
    () => sortByNearestWebinar(ongoingCourses, todayKoreaDate),
    [ongoingCourses, todayKoreaDate],
  );
  const listOnHoldCourses = useMemo(
    () => sortByNearestWebinar(onHoldCourses, todayKoreaDate),
    [onHoldCourses, todayKoreaDate],
  );
  const listCompletedCourses = useMemo(
    () => sortByNearestWebinar(completedCourses, todayKoreaDate),
    [completedCourses, todayKoreaDate],
  );
  const listCanceledCourses = useMemo(
    () => sortByNearestWebinar(canceledCourses, todayKoreaDate),
    [canceledCourses, todayKoreaDate],
  );

  function openStatusDialog(course: CourseSummary) {
    setStatusError("");
    setSelectedStatus(course.status);
    setStatusTarget(course);
  }

  function toggleStatusSection(status: CollapsibleCourseStatus) {
    setOpenStatuses((current) => ({
      ...current,
      [status]: !current[status],
    }));
  }

  async function saveCourseStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statusTarget) return;
    setSavingStatus(true);
    setStatusError("");
    try {
      const response = await fetch(
        `/api/course-operations/${statusTarget.id}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: selectedStatus }),
        },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message || "강의 상태 저장에 실패했습니다.");
      }
      setStatusTarget(null);
      router.refresh();
    } catch (caught) {
      setStatusError(
        caught instanceof Error
          ? caught.message
          : "강의 상태 저장에 실패했습니다.",
      );
    } finally {
      setSavingStatus(false);
    }
  }

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
      <div className="mb-5 flex flex-wrap justify-end gap-2">
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
        <Button asChild className="min-h-10">
          <Link href="/services/course-operations/new">
            <Plus />새 강의 만들기
          </Link>
        </Button>
      </div>

      {viewMode === "cards" ? (
        <div className="space-y-10">
          <section aria-label="진행 강의"><CourseSectionHeading title="진행" count={cardOngoingCourses.length} /><CourseCards courses={cardOngoingCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} /></section>
          <CourseStatusSection title="보류" count={cardOnHoldCourses.length} open={openStatuses.on_hold} onToggle={() => toggleStatusSection("on_hold")}><CourseCards courses={cardOnHoldCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} subdued /></CourseStatusSection>
          <CourseStatusSection title="완료" count={cardCompletedCourses.length} open={openStatuses.completed} onToggle={() => toggleStatusSection("completed")}><CourseCards courses={cardCompletedCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} subdued /></CourseStatusSection>
          <CourseStatusSection title="취소" count={cardCanceledCourses.length} open={openStatuses.canceled} onToggle={() => toggleStatusSection("canceled")}><CourseCards courses={cardCanceledCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} subdued /></CourseStatusSection>
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-10">
          <section aria-label="진행 강의"><CourseSectionHeading title="진행" count={listOngoingCourses.length} /><CourseTable courses={listOngoingCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} /></section>
          <CourseStatusSection title="보류" count={listOnHoldCourses.length} open={openStatuses.on_hold} onToggle={() => toggleStatusSection("on_hold")}><CourseTable courses={listOnHoldCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} subdued /></CourseStatusSection>
          <CourseStatusSection title="완료" count={listCompletedCourses.length} open={openStatuses.completed} onToggle={() => toggleStatusSection("completed")}><CourseTable courses={listCompletedCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} subdued /></CourseStatusSection>
          <CourseStatusSection title="취소" count={listCanceledCourses.length} open={openStatuses.canceled} onToggle={() => toggleStatusSection("canceled")}><CourseTable courses={listCanceledCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} subdued /></CourseStatusSection>
        </div>
      ) : (
        <div className="space-y-10"><section aria-label="진행 강의 일정"><CourseSectionHeading title="진행" count={ongoingCourses.length} />{ongoingCourses.length ? <CourseListCalendar courses={ongoingCourses} /> : <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">진행 중인 강의가 없습니다.</div>}</section><CourseStatusSection title="보류" count={listOnHoldCourses.length} open={openStatuses.on_hold} onToggle={() => toggleStatusSection("on_hold")}><CourseTable courses={listOnHoldCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} subdued /></CourseStatusSection><CourseStatusSection title="완료" count={listCompletedCourses.length} open={openStatuses.completed} onToggle={() => toggleStatusSection("completed")}><CourseTable courses={listCompletedCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} subdued /></CourseStatusSection><CourseStatusSection title="취소" count={listCanceledCourses.length} open={openStatuses.canceled} onToggle={() => toggleStatusSection("canceled")}><CourseTable courses={listCanceledCourses} canDelete={canDelete} onStatus={openStatusDialog} onDelete={openDeleteDialog} subdued /></CourseStatusSection></div>
      )}

      <Dialog
        open={Boolean(statusTarget)}
        onOpenChange={(openState) => {
          if (!openState && !savingStatus) {
            setStatusTarget(null);
            setStatusError("");
          }
        }}
      >
        <DialogContent>
          <form className="grid gap-5" onSubmit={saveCourseStatus}>
            <DialogHeader>
              <DialogTitle>강의 상태 변경</DialogTitle>
              <DialogDescription className="sr-only">
                강의 목록에 적용할 상태를 선택합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="course-status">상태</Label>
              <Select
                value={selectedStatus}
                disabled={savingStatus}
                onValueChange={(value) => {
                  if (isCourseStatus(value)) setSelectedStatus(value);
                }}
              >
                <SelectTrigger id="course-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COURSE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {COURSE_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {statusError ? (
              <Alert variant="destructive">
                <AlertTitle>상태를 저장할 수 없습니다</AlertTitle>
                <AlertDescription>{statusError}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={savingStatus}>
                  취소
                </Button>
              </DialogClose>
              <Button type="submit" disabled={savingStatus || !statusTarget}>
                {savingStatus ? <Loader2 className="animate-spin" /> : null}
                {savingStatus ? "저장 중..." : "저장"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
