"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BookOpenCheck,
  CalendarDays,
  Grid2X2,
  List,
  Loader2,
  Settings2,
  Trash2,
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
import { courseBannerUrl } from "@/lib/course-operations/banner";
import { sortByFarthestWebinar } from "@/lib/course-operations/webinar-proximity";

type ViewMode = "cards" | "list" | "calendar" | "payments";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function CourseOperationsList({
  courses,
  todayKoreaDate,
  canDelete,
  paymentSummaries = [],
}: {
  courses: CourseSummary[];
  todayKoreaDate: string;
  canDelete: boolean;
  paymentSummaries?: CoursePaymentSummary[];
}) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [deleteTarget, setDeleteTarget] = useState<CourseSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [loadedPaymentSummaries, setLoadedPaymentSummaries] = useState(paymentSummaries);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const cardCourses = useMemo(
    () => sortByFarthestWebinar(courses),
    [courses],
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
        throw new Error(body.message || "媛뺤쓽 ??젣???ㅽ뙣?덉뒿?덈떎.");
      }
      setDeleteTarget(null);
      router.refresh();
    } catch (caught) {
      setDeleteError(
        caught instanceof Error ? caught.message : "媛뺤쓽 ??젣???ㅽ뙣?덉뒿?덈떎.",
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
      if (!response.ok) throw new Error("寃곗젣?댁뿭??遺덈윭?ㅼ? 紐삵뻽?듬땲??");
      setLoadedPaymentSummaries(await response.json());
    } finally { setPaymentLoading(false); }
  }

  return (
    <>
      <div className="mb-4 flex justify-end" aria-label="媛뺤쓽 紐⑸줉 蹂닿린 諛⑹떇">
        <div className="inline-flex rounded-lg border bg-background p-1">
          <Button
            type="button"
            variant={viewMode === "cards" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("cards")}
            aria-pressed={viewMode === "cards"}
          >
            <Grid2X2 />
            移대뱶
          </Button>
          <Button
            type="button"
            variant={viewMode === "payments" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => void openPayments()}
            aria-pressed={viewMode === "payments"}
          >
            <CircleDollarSign />
            ?꾩껜 寃곗젣?댁뿭
          </Button>
          <Button
            type="button"
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
          >
            <List />
            由ъ뒪??
          </Button>
          <Button
            type="button"
            variant={viewMode === "calendar" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("calendar")}
            aria-pressed={viewMode === "calendar"}
          >
            <CalendarDays />
            罹섎┛??
          </Button>
        </div>
      </div>

      {viewMode === "cards" ? (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cardCourses.map((course) => (
            <Card
              key={course.id}
              className="min-h-[29rem] overflow-hidden transition-shadow hover:shadow-md"
            >
              {course.banner_image_path ? (
                <Link
                  href={`/services/course-operations/${course.id}`}
                  className="relative -mt-4 block aspect-video overflow-hidden bg-muted"
                  aria-label={`${course.name} 媛뺤쓽 諛곕꼫濡??곸꽭蹂닿린`}
                >
                  <Image
                    src={courseBannerUrl(course.id, course.updated_at)}
                    alt={`${course.name} 諛곕꼫`}
                    fill
                    unoptimized
                    sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover transition-transform duration-300 group-hover/card:scale-[1.02]"
                  />
                </Link>
              ) : null}
              <CardHeader>
                <div className="hidden">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <BookOpenCheck className="size-5" />
                  </span>
                  <Badge variant="secondary">
                    ?듭뀡 {course.course_options.length}媛?
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
                  title={`${course.cohort ? `${course.cohort}湲?/ ` : ""}${course.instructor_name}`}
                >
                  {course.cohort ? `${course.cohort}湲?/ ` : ""}{course.instructor_name}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 border-t pt-5">
                <p className="flex items-center gap-2 text-sm">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  臾대즺 ?⑤퉬??{formatDate(course.free_webinar_at)}
                </p>
                <div className="mt-auto grid grid-cols-[1fr_auto] gap-2">
                  <Button asChild>
                    <Link href={`/services/course-operations/${course.id}`}>
                      <Settings2 />?댁쁺 ?뺣낫 蹂닿린
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={!canDelete}
                    onClick={() => openDeleteDialog(course)}
                    aria-label={`${course.name} ??젣`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      ) : viewMode === "list" ? (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>媛뺤쓽紐?/TableHead>
                <TableHead>媛뺤궗紐?/TableHead>
                <TableHead>臾대즺 ?⑤퉬??/TableHead>
                <TableHead>媛쒓컯</TableHead>
                <TableHead>?곌껐 ?뺣낫</TableHead>
                <TableHead className="text-right">愿由?/TableHead>
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
                        ?듭뀡 {course.course_options.length}媛?
                      </Badge>
                      <Badge variant="outline">
                        紐낅떒 {course.course_jobs.length}媛?
                      </Badge>
                      <Badge variant="outline">
                        臾몄옄 {course.message_studio_projects.length}媛?
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/services/course-operations/${course.id}`}>
                          <Settings2 />蹂닿린
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={!canDelete}
                        onClick={() => openDeleteDialog(course)}
                      >
                        <Trash2 />??젣
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : viewMode === "calendar" ? (
        <CourseListCalendar courses={courses} />
      ) : (
        {paymentLoading ? <p className="py-12 text-center text-muted-foreground">寃곗젣?댁뿭??遺덈윭?ㅻ뒗 以묒엯?덈떎.</p> : <CoursePaymentSummaryTable summaries={loadedPaymentSummaries} />}
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(openState) => {
          if (!openState && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>媛뺤쓽瑜???젣?좉퉴??</AlertDialogTitle>
            <AlertDialogDescription>
              &apos;{deleteTarget?.name}&apos;??媛뺤쓽 ?뺣낫? ?듭뀡, ?좏뒠釉?異쒖뿰
              ?뺣낫媛 ??젣?⑸땲?? ?곌껐???섍컯??紐낅떒怨?臾몄옄 ?쒖옉臾쇱? ??젣?섏?
              ?딄퀬 媛뺤쓽 ?곌껐留??댁젣?⑸땲?? ???묒뾽? ?섎룎由????놁뒿?덈떎.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <Alert variant="destructive">
              <AlertTitle>媛뺤쓽瑜???젣?????놁뒿?덈떎</AlertTitle>
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>痍⑥냼</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting || !canDelete}
              onClick={(event) => {
                event.preventDefault();
                void deleteCourse();
              }}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {deleting ? "??젣 以?.." : "??젣"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
