import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  CircleAlert,
  CircleCheckBig,
  Clock3,
  Gauge,
  ListChecks,
  MapPin,
  NotebookPen,
  PlaneTakeoff,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCourseOptions } from "@/components/dashboard/dashboard-course-options";
import { DashboardMenuSearch } from "@/components/dashboard/dashboard-menu-search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardExternalMarketingCourse } from "@/lib/dashboard/external-marketing";
import type { CoursePreparationSummary } from "@/lib/dashboard/course-preparation";
import type { DashboardLeave } from "@/lib/dashboard/leaves";
import type { DashboardCourseSearchItem, DashboardMenuCustomKeywords } from "@/lib/dashboard/menu-search";
import type { BusinessTripDashboardSummary } from "@/lib/business-trip-reports/types";

export type DashboardCourse = {
  id: string;
  name: string;
  instructor: string;
  cohort: string;
  webinarDate: string;
  countdown: string;
};

export type DashboardWbsTask = {
  courseId: string;
  itemId: string;
  instructorName: string;
  courseName: string;
  title: string;
  owner: string;
  scheduledDate: string;
  timing: "overdue" | "today" | "upcoming";
};

export type DashboardCoursePreparation = Omit<CoursePreparationSummary, "webinarAt"> & {
  webinarDate: string;
  countdown: string;
};

export type DashboardSchedule = {
  id: string;
  title: string;
  time: string;
  detail: string;
  location: string;
  href: string;
  startMinutes: number;
};

type DashboardData = {
  userName: string;
  todayLabel: string;
  courses: DashboardCourse[];
  searchCourses: DashboardCourseSearchItem[];
  menuSearchKeywords: DashboardMenuCustomKeywords;
  businessTrips: BusinessTripDashboardSummary;
  preparationCourses: DashboardCoursePreparation[];
  wbsTasks: DashboardWbsTask[];
  schedules: DashboardSchedule[];
  leaves: DashboardLeave[];
  externalMarketing: DashboardExternalMarketingCourse[];
  errors: Partial<Record<"tripReports" | "courses" | "wbs" | "schedules" | "leaves" | "externalMarketing", string>>;
};

const numberFormatter = new Intl.NumberFormat("ko-KR");
const DASHBOARD_QUICK_LINKS = [
  { label: "근태", href: "/hr/leave", icon: CalendarCheck2 },
  { label: "업무일지", href: "/hr", icon: NotebookPen },
  { label: "팀일정", href: "/calendar", icon: CalendarRange },
  { label: "출장보고서", href: "/services/business-trip-reports", icon: PlaneTakeoff },
] as const;

function won(value: number | null) {
  return value === null ? "-" : `${numberFormatter.format(Math.round(value))}원`;
}

function SectionHeader({
  title,
  href,
}: {
  title: string;
  href: string;
}) {
  return (
    <CardHeader className="border-b px-5 py-4 sm:px-6">
      <CardTitle className="text-lg font-semibold tracking-tight">
        <Link href={href} className="rounded-sm transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          {title}
        </Link>
      </CardTitle>
    </CardHeader>
  );
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-xl border border-dashed bg-slate-50/70 px-5 text-center text-sm text-muted-foreground">
      <CalendarClock className="mb-3 size-6 text-slate-400" aria-hidden="true" />
      {children}
    </div>
  );
}

function ErrorState({ children }: { children: string }) {
  return (
    <div className="flex min-h-24 items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 text-sm text-red-700">
      <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
      {children}
    </div>
  );
}

function dateLabel(value: string) {
  if (!value) return "일정 미정";
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

const PREPARATION_STATUS = {
  danger: {
    label: "위험",
    badgeClass: "bg-red-100 text-red-800",
    borderClass: "border-red-200",
    barClass: "bg-red-500",
  },
  warning: {
    label: "주의",
    badgeClass: "bg-amber-100 text-amber-800",
    borderClass: "border-amber-200",
    barClass: "bg-amber-500",
  },
  normal: {
    label: "정상",
    badgeClass: "bg-blue-100 text-blue-800",
    borderClass: "border-slate-200",
    barClass: "bg-blue-500",
  },
  complete: {
    label: "준비 완료",
    badgeClass: "bg-emerald-100 text-emerald-800",
    borderClass: "border-emerald-200",
    barClass: "bg-emerald-500",
  },
} as const;

function CoursePreparationSection({ courses, error }: { courses: DashboardCoursePreparation[]; error?: string }) {
  const dangerCount = courses.filter((course) => course.status === "danger").length;
  const dueTodayCount = courses.reduce((total, course) => total + course.todayCount, 0);
  const missingWbsCount = courses.filter((course) => course.wbsMissing).length;
  const summaries = [
    { label: "진행 강의", value: courses.length, icon: ListChecks, className: "text-blue-700 bg-blue-50" },
    { label: "위험 강의", value: dangerCount, icon: TriangleAlert, className: dangerCount ? "text-red-700 bg-red-50" : "text-slate-600 bg-slate-100" },
    { label: "오늘 마감", value: dueTodayCount, icon: Clock3, className: dueTodayCount ? "text-amber-700 bg-amber-50" : "text-slate-600 bg-slate-100" },
    { label: "WBS 미등록", value: missingWbsCount, icon: Gauge, className: missingWbsCount ? "text-violet-700 bg-violet-50" : "text-slate-600 bg-slate-100" },
  ];

  return (
    <Card className="mb-5 gap-0 overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
      <SectionHeader title="강의 준비 현황" href="/services/course-wbs" />
      <CardContent className="p-4 sm:p-5">
        {error ? <ErrorState>{error}</ErrorState> : courses.length ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {summaries.map(({ label, value, icon: Icon, className }) => (
                <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${className}`}>
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <div>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-xl font-semibold tabular-nums text-slate-950">{numberFormatter.format(value)}</dd>
                  </div>
                </div>
              ))}
            </dl>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {courses.slice(0, 6).map((course) => {
                const status = PREPARATION_STATUS[course.status];
                const signals = [
                  { label: "지연", count: course.overdueCount, className: "bg-red-50 text-red-700" },
                  { label: "오늘", count: course.todayCount, className: "bg-amber-50 text-amber-700" },
                  { label: "등록 누락", count: course.missingCount, className: "bg-violet-50 text-violet-700" },
                  { label: "진행 필요", count: course.activeCount, className: "bg-orange-50 text-orange-700" },
                  { label: "일정 미정", count: course.undatedCount, className: "bg-slate-100 text-slate-700" },
                  { label: "7일 이내", count: course.upcomingCount, className: "bg-blue-50 text-blue-700" },
                ].filter((signal) => signal.count > 0);

                return (
                  <article key={course.id} className={`rounded-xl border bg-white p-4 ${status.borderClass}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/services/course-wbs?courseId=${encodeURIComponent(course.id)}`}
                          className="line-clamp-2 rounded-sm text-sm font-semibold leading-5 text-slate-950 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                        >
                          {course.name}
                        </Link>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {course.instructorName || "강사 미정"} | {course.cohort || "기수 미정"}
                        </p>
                      </div>
                      <Badge variant="secondary" className={`shrink-0 ${status.badgeClass}`}>{status.label}</Badge>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{course.webinarDate}</span>
                      {course.countdown ? <span className="font-medium text-blue-700">{course.countdown}</span> : null}
                    </div>

                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700">준비도 {course.progress}%</span>
                        <span className="tabular-nums text-muted-foreground">{course.completedCount}/{course.totalCount}</span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`${course.name} 준비도`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={course.progress}
                        className="h-2 overflow-hidden rounded-full bg-slate-100"
                      >
                        <div className={`h-full rounded-full ${status.barClass}`} style={{ width: `${course.progress}%` }} />
                      </div>
                    </div>

                    <div className="mt-3 flex min-h-6 flex-wrap gap-1.5">
                      {course.wbsMissing ? <Badge variant="secondary" className="bg-violet-50 text-violet-700">WBS 미등록</Badge> : null}
                      {signals.length ? signals.map((signal) => (
                        <Badge key={signal.label} variant="secondary" className={signal.className}>{signal.label} {signal.count}</Badge>
                      )) : course.wbsMissing ? null : course.status === "complete" ? (
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">준비 완료</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600">지연 없음</Badge>
                      )}
                    </div>

                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5">
                      {course.wbsMissing ? (
                        <p className="font-medium text-violet-700">WBS 등록이 필요합니다.</p>
                      ) : course.status === "complete" ? (
                        <p className="flex items-center gap-1.5 font-medium text-emerald-700">
                          <CircleCheckBig className="size-4" aria-hidden="true" />
                          모든 준비 업무를 완료했습니다.
                        </p>
                      ) : course.nextTask ? (
                        <>
                          <p className="line-clamp-1 font-medium text-slate-900">다음 업무 · {course.nextTask.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                            {course.nextTask.owner || "담당자 미정"} | {dateLabel(course.nextTask.scheduledDate)} | {course.nextTask.reason}
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">확인할 다음 업무가 없습니다.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {courses.length > 6 ? <p className="text-right text-xs text-muted-foreground">그 외 {numberFormatter.format(courses.length - 6)}개 강의</p> : null}
          </div>
        ) : <EmptyState>현재 준비 중인 강의가 없습니다.</EmptyState>}
      </CardContent>
    </Card>
  );
}

export function CourseDashboard({ data }: { data: DashboardData }) {
  return (
    <main className="min-h-dvh bg-slate-50/70">
      <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">{data.userName}님 안녕하세요.</h1>
            <nav aria-label="업무 빠른 이동" className="flex flex-wrap items-center gap-2">
              {DASHBOARD_QUICK_LINKS.map(({ label, href, icon: Icon }) => (
                <Button key={href} variant="outline" size="sm" className="bg-white shadow-sm" asChild>
                  <Link href={href}>
                    <Icon aria-hidden="true" />
                    {label}
                  </Link>
                </Button>
              ))}
            </nav>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm">
            <CalendarDays className="size-4 text-blue-600" aria-hidden="true" />
            {data.todayLabel}
          </div>
        </div>

        <DashboardMenuSearch courses={data.searchCourses} customKeywords={data.menuSearchKeywords} />

        <CoursePreparationSection courses={data.preparationCourses} error={data.errors.wbs} />

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="gap-0 overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
            <SectionHeader title="현재 진행 중인 강의" href="/services/course-operations" />
            <CardContent className="p-4 sm:p-5">
              {data.errors.courses ? <ErrorState>{data.errors.courses}</ErrorState> : data.courses.length ? (
                <div className="space-y-2.5">
                  {data.courses.slice(0, 4).map((course) => (
                    <DropdownMenu key={course.id}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`${course.name} 이동 메뉴 열기`}
                          className="group flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 data-[state=open]:border-blue-300 data-[state=open]:bg-blue-50/60"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-700 group-data-[state=open]:text-blue-700">{course.name}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {course.instructor || "강사 미정"} | {course.webinarDate} | {course.cohort || "기수 미정"}
                            </p>
                          </div>
                          {course.countdown ? <Badge variant="secondary" className="mt-0.5 shrink-0 bg-blue-50 text-blue-700">{course.countdown}</Badge> : null}
                          <ChevronDown className="mt-1 size-4 shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180 group-data-[state=open]:text-blue-600" aria-hidden="true" />
                        </button>
                      </DropdownMenuTrigger>
                      <DashboardCourseOptions courseId={course.id} />
                    </DropdownMenu>
                  ))}
                </div>
              ) : <EmptyState>현재 진행 중인 강의가 없습니다.</EmptyState>}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
            <SectionHeader title="강의별 해야할 일" href="/services/course-wbs" />
            <CardContent className="p-4 sm:p-5">
              {data.errors.wbs ? <ErrorState>{data.errors.wbs}</ErrorState> : data.wbsTasks.length ? (
                <div className="space-y-2.5">
                  {data.wbsTasks.slice(0, 4).map((task) => (
                    <Link key={`${task.courseId}-${task.itemId}`} href={`/services/course-wbs?courseId=${task.courseId}`} className="group flex gap-3 rounded-xl border border-slate-200 p-3.5 transition-colors hover:border-violet-300 hover:bg-violet-50/40">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-violet-800">{task.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {task.instructorName || "강사 미정"} | {task.courseName} | {task.title} | {dateLabel(task.scheduledDate)} | {task.owner || "담당자 미정"}
                        </p>
                      </div>
                      <Badge variant={task.timing === "overdue" ? "destructive" : "secondary"} className="mt-0.5">
                        {task.timing === "overdue" ? "지연" : task.timing === "today" ? "오늘" : "예정"}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : <EmptyState>현재 확인할 WBS 업무가 없습니다.</EmptyState>}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
            <SectionHeader title="오늘 일정" href="/calendar" />
            <CardContent className="p-4 sm:p-5">
              {data.errors.schedules ? <ErrorState>{data.errors.schedules}</ErrorState> : data.schedules.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.schedules.slice(0, 4).map((schedule) => (
                    <Link key={schedule.id} href={schedule.href} className="group rounded-xl border border-slate-200 p-4 transition-colors hover:border-amber-300 hover:bg-amber-50/40">
                      <div className="flex items-start justify-between gap-3">
                        <p className="line-clamp-2 font-semibold text-slate-900 group-hover:text-amber-800">{schedule.title}</p>
                        <ArrowRight className="mt-1 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                        <p className="flex items-center gap-2"><Clock3 className="size-3.5 text-amber-600" aria-hidden="true" />{schedule.time}</p>
                        <p className="flex items-center gap-2"><BookOpenCheck className="size-3.5 text-amber-600" aria-hidden="true" />{schedule.detail}</p>
                        {schedule.location ? <p className="flex items-center gap-2"><MapPin className="size-3.5 text-amber-600" aria-hidden="true" />{schedule.location}</p> : null}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : <EmptyState>오늘 등록된 일정이 없습니다.</EmptyState>}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
            <SectionHeader title="휴가자 정보" href="/hr/leave" />
            <CardContent className="p-4 sm:p-5">
              {data.errors.leaves ? <ErrorState>{data.errors.leaves}</ErrorState> : data.leaves.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {data.leaves.map((leave) => (
                    <Link key={leave.id} href={leave.href} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 font-semibold text-emerald-800">{leave.name.slice(0, 1)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">{leave.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {leave.status === "today" ? leave.unit : `${dateLabel(leave.leaveDate)} · ${leave.unit}`}
                        </p>
                      </div>
                      <Badge
                        variant={leave.status === "pending" ? "outline" : "secondary"}
                        className={leave.status === "today"
                          ? "shrink-0 bg-emerald-100 text-emerald-800"
                          : leave.status === "pending"
                            ? "shrink-0 border-amber-300 bg-amber-50 text-amber-800"
                            : "shrink-0 bg-blue-50 text-blue-700"}
                      >
                        {leave.status === "today" ? "오늘" : leave.status === "pending" ? "미승인" : "예정"}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : <EmptyState>오늘부터 일주일 이내 휴가자가 없습니다.</EmptyState>}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
            <SectionHeader title="외부 마케팅 진행 강의" href="/services/external-marketing" />
            <CardContent className="p-4 sm:p-5">
              {data.errors.externalMarketing ? <ErrorState>{data.errors.externalMarketing}</ErrorState> : data.externalMarketing.length ? (
                <div className="space-y-2.5">
                  {data.externalMarketing.slice(0, 4).map((project) => (
                    <Link key={project.dashboardId} href={`/services/external-marketing/${project.dashboardId}?tab=performance`} className="group block rounded-xl border border-slate-200 p-3.5 transition-colors hover:border-rose-300 hover:bg-rose-50/40">
                      <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-rose-800">{project.courseName || "강의명 미입력"}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {project.instructorName || "강사 미정"} | {project.cohort || "기수 미정"}
                      </p>
                      <dl className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
                        <div>
                          <dt className="text-[11px] text-muted-foreground">집행금액</dt>
                          <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{won(project.spend)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-muted-foreground">랜딩접수 DB / 단가</dt>
                          <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{numberFormatter.format(project.landingLeads)}건</dd>
                          <dd className="mt-0.5 text-xs tabular-nums text-muted-foreground">단가 {won(project.landingLeadCost)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-muted-foreground">광고접수 DB / 단가</dt>
                          <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{numberFormatter.format(project.adLeads)}건</dd>
                          <dd className="mt-0.5 text-xs tabular-nums text-muted-foreground">단가 {won(project.adLeadCost)}</dd>
                        </div>
                      </dl>
                    </Link>
                  ))}
                </div>
              ) : <EmptyState>현재 진행 중인 외부 마케팅 강의가 없습니다.</EmptyState>}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden border-slate-200 bg-white py-0 shadow-sm">
            <SectionHeader title="출장보고" href="/services/business-trip-reports" />
            <CardContent className="p-4 sm:p-5">
              {data.errors.tripReports ? <ErrorState>{data.errors.tripReports}</ErrorState> : (
                <Link href="/services/business-trip-reports" className="group flex min-h-36 items-center gap-4 rounded-xl border border-slate-200 p-5 transition-colors hover:border-rose-300 hover:bg-rose-50/40">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700">
                    <PlaneTakeoff className="size-6" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-muted-foreground">지급해야 할 출장 비용</p>
                    {data.businessTrips.unpaidCount ? (
                      <>
                        <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{numberFormatter.format(data.businessTrips.unpaidCost)}원</p>
                        <p className="mt-1 text-sm text-rose-700">미지급 출장보고 {numberFormatter.format(data.businessTrips.unpaidCount)}건</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-xl font-semibold text-emerald-700">지급할 비용 없음</p>
                        <p className="mt-1 text-sm text-muted-foreground">등록된 출장 비용이 모두 지급됐습니다.</p>
                      </>
                    )}
                  </div>
                  <ArrowRight className="size-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-rose-700" aria-hidden="true" />
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
