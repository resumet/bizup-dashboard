"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BookOpenCheck,
  CalendarDays,
  FileSpreadsheet,
  Grid2X2,
  List,
  Loader2,
  MessageSquareText,
  Settings2,
  Trash2,
} from "lucide-react";

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

type ViewMode = "cards" | "list";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function CourseOperationsList({ courses }: { courses: CourseSummary[] }) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [deleteTarget, setDeleteTarget] = useState<CourseSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function deleteCourse() {
    if (!deleteTarget) return;
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
      <div className="mb-4 flex justify-end" aria-label="강의 목록 보기 방식">
        <div className="inline-flex rounded-lg border bg-background p-1">
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
        </div>
      </div>

      {viewMode === "cards" ? (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Card
              key={course.id}
              className="h-[23rem] overflow-hidden transition-shadow hover:shadow-md"
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <BookOpenCheck className="size-5" />
                  </span>
                  <Badge variant="secondary">
                    옵션 {course.course_options.length}개
                  </Badge>
                </div>
                <CardTitle
                  className="line-clamp-2 min-h-14 pt-3 text-xl leading-7"
                  title={course.name}
                >
                  {course.name}
                </CardTitle>
                <p
                  className="truncate text-sm text-muted-foreground"
                  title={course.instructor_name}
                >
                  {course.instructor_name}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 border-t pt-5">
                <div className="grid gap-2 text-sm">
                  <p className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-muted-foreground" />
                    무료 웨비나 {formatDate(course.free_webinar_at)}
                  </p>
                  <p className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-muted-foreground" />
                    개강 {formatDate(course.starts_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    <FileSpreadsheet />명단 {course.course_jobs.length}개
                  </Badge>
                  <Badge variant="outline">
                    <MessageSquareText />문자 제작물{" "}
                    {course.message_studio_projects.length}개
                  </Badge>
                </div>
                <div className="mt-auto grid grid-cols-[1fr_auto] gap-2">
                  <Button asChild>
                    <Link href={`/services/course-operations/${course.id}`}>
                      <Settings2 />운영 정보 보기
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => openDeleteDialog(course)}
                    aria-label={`${course.name} 삭제`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>강의명</TableHead>
                <TableHead>강사명</TableHead>
                <TableHead>무료 웨비나</TableHead>
                <TableHead>개강</TableHead>
                <TableHead>연결 정보</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/services/course-operations/${course.id}`}
                      className="hover:underline"
                    >
                      {course.name}
                    </Link>
                  </TableCell>
                  <TableCell>{course.instructor_name}</TableCell>
                  <TableCell>{formatDate(course.free_webinar_at)}</TableCell>
                  <TableCell>{formatDate(course.starts_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">
                        옵션 {course.course_options.length}개
                      </Badge>
                      <Badge variant="outline">
                        명단 {course.course_jobs.length}개
                      </Badge>
                      <Badge variant="outline">
                        문자 {course.message_studio_projects.length}개
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/services/course-operations/${course.id}`}>
                          <Settings2 />보기
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => openDeleteDialog(course)}
                      >
                        <Trash2 />삭제
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
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
              disabled={deleting}
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
