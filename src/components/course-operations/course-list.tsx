"use client";

import Image from "next/image";
import { ChatAudienceNotice } from "@/components/ad-performance/chat-audience-notice";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, Grid2X2, List, Plus } from "lucide-react";
import { CourseListCalendar } from "@/components/course-operations/course-list-calendar";
import { CourseManagementMenu } from "@/components/course-operations/course-management-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CourseSummary } from "@/lib/course-operations/types";
import { courseBannerUrl } from "@/lib/course-operations/banner";
import { COURSE_LIST_COLLAPSIBLE_STATUS_ORDER, COURSE_LIST_INITIAL_OPEN_STATUSES, formatCourseWbsProgress } from "@/lib/course-operations/course-list-display";
import { partitionCoursesByStatus } from "@/lib/course-operations/course-list-status";
import { COURSE_STATUS_LABELS, type CourseStatus } from "@/lib/course-operations/course-status";
import { formatWebinarCountdownLabel, sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import { COURSE_PAGE_LINKS } from "@/lib/course-operations/course-page-links";
import { formatDashboardCohort, formatDashboardWebinarDate } from "@/lib/dashboard/course-metadata";

type ViewMode = "cards" | "list" | "calendar";
type CollapsibleCourseStatus = Exclude<CourseStatus, "ongoing">;
const number = new Intl.NumberFormat("ko-KR");

function formatAdLeadCost(value: number | null) {
  return value === null ? "—" : `${number.format(Math.round(value))}원`;
}

function formatCourseListWebinarDate(value: string) {
  if (Number.isNaN(Date.parse(value))) return "날짜 미정";
  return formatDashboardWebinarDate(value);
}

function CourseSectionHeading({ title, count }: { title: string; count: number }) {
  return <div className="mb-4 flex items-baseline justify-between gap-3">
    <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
    <span className="text-sm tabular-nums text-muted-foreground">{count}개</span>
  </div>;
}

function CourseMetadata({ course, today }: { course: CourseSummary; today: string }) {
  return <p className="text-xs text-muted-foreground">
    {course.instructor_name || "강사 미지정"} | {formatDashboardCohort(course.cohort)} | {formatWebinarCountdownLabel(course.free_webinar_at, today) || "일정 미정"}
  </p>;
}

function CoursePageLinkCount({ filled }: { filled: number }) {
  return <Badge variant="outline" className={filled === COURSE_PAGE_LINKS.length
    ? "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
    : "border-red-200 bg-red-100 text-red-900"}>
    {filled}/{COURSE_PAGE_LINKS.length}
  </Badge>;
}

function CourseActionsMenu({ course }: { course: CourseSummary }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={`${course.name} 관리 메뉴`}>관리<ChevronDown aria-hidden="true" /></Button></DropdownMenuTrigger><CourseManagementMenu courseId={course.id} /></DropdownMenu>;
}

function CourseCards({ courses, todayKoreaDate, subdued = false }: {
  courses: CourseSummary[];
  todayKoreaDate: string;
  subdued?: boolean;
}) {
  if (!courses.length) return <div className="rounded-xl border border-dashed bg-background px-5 py-10 text-center text-sm text-muted-foreground">표시할 강의가 없습니다.</div>;
  return <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{courses.map((course, index) => (
    <Card key={course.id} className={`relative gap-0 overflow-hidden py-0 shadow-none transition-colors hover:ring-foreground/20 ${subdued ? "bg-muted/30" : ""}`}>
      <div className="absolute right-2 top-2 z-10">
        <CourseActionsMenu course={course} />
      </div>
      {course.banner_image_path ? <Link href={`/services/course-operations/${course.id}`} className={`relative block aspect-video overflow-hidden border-b bg-muted ${subdued ? "grayscale-[35%]" : ""}`} aria-label={`${course.name} 강의 배너로 상세보기`}>
        <Image src={courseBannerUrl(course.id, course.updated_at)} alt={`${course.name} 배너`} fill unoptimized loading={index < 2 && !subdued ? "eager" : "lazy"} priority={index < 2 && !subdued} sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover" />
      </Link> : null}
      <CardHeader className="gap-2 px-5 py-5 pr-24">
        <CardTitle className="line-clamp-2 text-lg leading-7" title={course.name}>
          <Link href={`/services/course-operations/${course.id}`} className="underline-offset-4 hover:underline">
            {course.name}
          </Link>
        </CardTitle>
        <CourseMetadata course={course} today={todayKoreaDate} />
      </CardHeader>
      <div className="px-5"><ChatAudienceNotice message={course.chatAudienceAlert} /></div>
      <dl className="mt-auto grid grid-cols-2 border-t text-sm">
        <div className="border-b px-5 py-4">
          <dt className="text-xs text-muted-foreground">신청자DB숫자</dt>
          <dd className="mt-1 font-medium tabular-nums">{course.free_applicant_count == null ? "—" : number.format(course.free_applicant_count)}</dd>
        </div>
        <div className="border-b border-l px-5 py-4">
          <dt className="text-xs text-muted-foreground">카톡방 인원</dt>
          <dd className="mt-1 font-medium tabular-nums">{course.chatRoomMembers == null ? "—" : number.format(course.chatRoomMembers)}</dd>
        </div>
        <div className="border-b px-5 py-4">
          <dt className="text-xs text-muted-foreground">강의 페이지 링크</dt>
          <dd className="mt-1"><CoursePageLinkCount filled={course.course_page_link_count} /></dd>
        </div>
        <div className="border-b border-l px-5 py-4">
          <dt className="text-xs text-muted-foreground">웨비나 날짜</dt>
          <dd className="mt-1 font-medium tabular-nums">{formatCourseListWebinarDate(course.free_webinar_at)}</dd>
        </div>
        <div className="col-span-2 px-5 py-4">
          <dt className="text-xs text-muted-foreground">WBS 일정</dt>
          <dd className={`mt-1 font-medium tabular-nums ${course.wbs_overdue_item_count > 0 ? "text-destructive" : ""}`}>
            {formatCourseWbsProgress(course.wbs_overdue_item_count, course.wbs_total_item_count)}
          </dd>
        </div>
        {!subdued ? <div className="col-span-2 grid grid-cols-2 border-t text-sm">
          <div className="px-5 py-4">
            <dt className="text-xs text-muted-foreground">광고접수 DB 단가</dt>
            <dd className="mt-1 font-medium tabular-nums">G : {formatAdLeadCost(course.google_ad_lead_cost)}</dd>
          </div>
          <div className="border-l px-5 py-4">
            <dt className="sr-only">Meta 광고접수 DB 단가</dt>
            <dd className="mt-1 font-medium tabular-nums">M : {formatAdLeadCost(course.meta_ad_lead_cost)}</dd>
          </div>
        </div> : null}
      </dl>
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
    <section className="border-t pt-5" aria-label={`${title} 강의`}>
      <Button
        type="button"
        variant="ghost"
        className="mb-4 h-auto w-full justify-between gap-3 px-0 text-left text-lg font-semibold tracking-tight hover:bg-transparent"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{title}</span>
        <span className="ml-auto text-sm font-normal tabular-nums text-muted-foreground">{count}개</span>
        <ChevronDown className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open ? children : null}
    </section>
  );
}

function CourseTable({ courses, todayKoreaDate, subdued = false }: {
  courses: CourseSummary[];
  todayKoreaDate: string;
  subdued?: boolean;
}) {
  if (!courses.length) return <div className="rounded-xl border border-dashed bg-background px-5 py-10 text-center text-sm text-muted-foreground">표시할 강의가 없습니다.</div>;
  return <Card className={`gap-0 overflow-hidden py-0 shadow-none ${subdued ? "bg-muted/30" : ""}`}>
    <Table>
      <TableHeader><TableRow><TableHead>강의명</TableHead><TableHead>웨비나 날짜</TableHead><TableHead>강의 페이지 링크</TableHead><TableHead>WBS 일정</TableHead><TableHead className="text-right">신청자DB숫자</TableHead><TableHead className="text-right">카톡방 인원</TableHead>{!subdued ? <TableHead>광고접수 DB 단가</TableHead> : null}<TableHead className="text-right">관리</TableHead></TableRow></TableHeader>
      <TableBody>{courses.map((course) => <TableRow key={course.id} className={subdued ? "text-muted-foreground" : ""}>
        <TableCell>
          <Link href={`/services/course-operations/${course.id}`} className="font-medium hover:underline">{course.name}</Link>
          <CourseMetadata course={course} today={todayKoreaDate} />
          <ChatAudienceNotice message={course.chatAudienceAlert} />
        </TableCell>
        <TableCell>{formatCourseListWebinarDate(course.free_webinar_at)}</TableCell>
        <TableCell>
          <CoursePageLinkCount filled={course.course_page_link_count} />
        </TableCell>
        <TableCell>
          <Badge variant={course.wbs_overdue_item_count > 0 ? "destructive" : "secondary"}>
            {formatCourseWbsProgress(course.wbs_overdue_item_count, course.wbs_total_item_count)}
          </Badge>
        </TableCell>
        <TableCell className="text-right tabular-nums">{course.free_applicant_count == null ? "—" : number.format(course.free_applicant_count)}</TableCell>
        <TableCell className="text-right tabular-nums">{course.chatRoomMembers == null ? "—" : number.format(course.chatRoomMembers)}</TableCell>
        {!subdued ? <TableCell className="text-xs tabular-nums">
          <div>G : {formatAdLeadCost(course.google_ad_lead_cost)}</div>
          <div className="mt-1">M : {formatAdLeadCost(course.meta_ad_lead_cost)}</div>
        </TableCell> : null}
        <TableCell className="text-right"><CourseActionsMenu course={course} /></TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </Card>;
}

export function CourseOperationsList({
  courses,
  todayKoreaDate,
}: {
  courses: CourseSummary[];
  todayKoreaDate: string;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [openStatuses, setOpenStatuses] = useState<
    Record<CollapsibleCourseStatus, boolean>
  >({ ...COURSE_LIST_INITIAL_OPEN_STATUSES });
  const {
    ongoing: ongoingCourses,
    onHold: onHoldCourses,
    completed: completedCourses,
    canceled: canceledCourses,
  } = useMemo(
    () => partitionCoursesByStatus(courses),
    [courses],
  );
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
  const collapsibleSections = COURSE_LIST_COLLAPSIBLE_STATUS_ORDER.map((status) => ({
    status,
    title: COURSE_STATUS_LABELS[status],
    courses: {
      completed: listCompletedCourses,
      canceled: listCanceledCourses,
      on_hold: listOnHoldCourses,
    }[status],
  }));

  function toggleStatusSection(status: CollapsibleCourseStatus) {
    setOpenStatuses((current) => ({
      ...current,
      [status]: !current[status],
    }));
  }


  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b pb-5">
        <div className="inline-flex self-start rounded-lg bg-muted/60 p-1 sm:self-auto" aria-label="강의 목록 보기 방식">
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
          <section aria-label="진행 강의"><CourseSectionHeading title="진행" count={listOngoingCourses.length} /><CourseCards courses={listOngoingCourses} todayKoreaDate={todayKoreaDate} /></section>
          {collapsibleSections.map((section) => <CourseStatusSection key={section.status} title={section.title} count={section.courses.length} open={openStatuses[section.status]} onToggle={() => toggleStatusSection(section.status)}><CourseCards courses={section.courses} todayKoreaDate={todayKoreaDate} subdued /></CourseStatusSection>)}
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-10">
          <section aria-label="진행 강의"><CourseSectionHeading title="진행" count={listOngoingCourses.length} /><CourseTable courses={listOngoingCourses} todayKoreaDate={todayKoreaDate} /></section>
          {collapsibleSections.map((section) => <CourseStatusSection key={section.status} title={section.title} count={section.courses.length} open={openStatuses[section.status]} onToggle={() => toggleStatusSection(section.status)}><CourseTable courses={section.courses} todayKoreaDate={todayKoreaDate} subdued /></CourseStatusSection>)}
        </div>
      ) : (
        <div className="space-y-10"><section aria-label="진행 강의 일정"><CourseSectionHeading title="진행" count={ongoingCourses.length} />{ongoingCourses.length ? <CourseListCalendar courses={ongoingCourses} /> : <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">진행 중인 강의가 없습니다.</div>}</section>{collapsibleSections.map((section) => <CourseStatusSection key={section.status} title={section.title} count={section.courses.length} open={openStatuses[section.status]} onToggle={() => toggleStatusSection(section.status)}><CourseTable courses={section.courses} todayKoreaDate={todayKoreaDate} subdued /></CourseStatusSection>)}</div>
      )}

    </>
  );
}
