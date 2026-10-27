import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  CircleAlert,
  Clock3,
  ClipboardList,
  MapPin,
  Radio,
  UsersRound,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DashboardMenuSearch } from "@/components/dashboard/dashboard-menu-search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DashboardExternalMarketingCourse } from "@/lib/dashboard/external-marketing";
import type { DashboardCourseSearchItem } from "@/lib/dashboard/menu-search";
import { getDashboardCourseDestinations } from "@/lib/work/instructor-course-search";

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

export type DashboardSchedule = {
  id: string;
  title: string;
  time: string;
  detail: string;
  location: string;
  href: string;
  startMinutes: number;
};

export type DashboardLeave = {
  id: string;
  name: string;
  unit: string;
  href: string;
};

type DashboardData = {
  userName: string;
  todayLabel: string;
  courses: DashboardCourse[];
  searchCourses: DashboardCourseSearchItem[];
  wbsTasks: DashboardWbsTask[];
  schedules: DashboardSchedule[];
  leaves: DashboardLeave[];
  externalMarketing: DashboardExternalMarketingCourse[];
  errors: Partial<Record<"courses" | "wbs" | "schedules" | "leaves" | "externalMarketing", string>>;
};

const numberFormatter = new Intl.NumberFormat("ko-KR");
const courseDestinationIcons = [Video, Radio, UsersRound, ClipboardList, BookOpenCheck];

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

export function CourseDashboard({ data }: { data: DashboardData }) {
  return (
    <main className="min-h-dvh bg-slate-50/70">
      <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">{data.userName}님 안녕하세요.</h1>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm">
            <CalendarDays className="size-4 text-blue-600" aria-hidden="true" />
            {data.todayLabel}
          </div>
        </div>

        <DashboardMenuSearch courses={data.searchCourses} />

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
                      <DropdownMenuContent align="start" className="min-w-64 p-1.5">
                        {getDashboardCourseDestinations(course.id).map((destination, index) => {
                          const DestinationIcon = courseDestinationIcons[index];
                          return (
                            <DropdownMenuItem key={destination.href} asChild className="px-2.5 py-2.5">
                              <Link href={destination.href}>
                                <DestinationIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                                <span>{destination.label}</span>
                                <ArrowRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
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
            <SectionHeader title="오늘 휴가자" href="/hr/leave" />
            <CardContent className="p-4 sm:p-5">
              {data.errors.leaves ? <ErrorState>{data.errors.leaves}</ErrorState> : data.leaves.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  {data.leaves.slice(0, 4).map((leave) => (
                    <Link key={leave.id} href={leave.href} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40">
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 font-semibold text-emerald-800">{leave.name.slice(0, 1)}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{leave.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{leave.unit}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : <EmptyState>오늘 휴가자가 없습니다.</EmptyState>}
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
        </div>
      </div>
    </main>
  );
}
