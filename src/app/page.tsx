import { redirect } from "next/navigation";

import {
  CourseDashboard,
  type DashboardCourse,
  type DashboardCoursePreparation,
  type DashboardSchedule,
  type DashboardWbsTask,
} from "@/components/dashboard/course-dashboard";
import { getCachedCourseSummaries } from "@/lib/course-operations/list-cache";
import { formatWebinarCountdown } from "@/lib/course-operations/webinar-proximity";
import { loadCourseWbsBootstrap } from "@/lib/course-wbs/server";
import { formatDashboardCohort, formatDashboardWebinarDate } from "@/lib/dashboard/course-metadata";
import { buildDashboardCoursePreparation } from "@/lib/dashboard/course-preparation";
import { activeExternalMarketingCourses } from "@/lib/dashboard/external-marketing";
import { loadDashboardLeaves } from "@/lib/dashboard/leaves-server";
import { loadDashboardMenuSearchKeywordSettings } from "@/lib/admin/menu-search-keywords-storage";
import { loadExternalMarketingProjects } from "@/lib/external-marketing/server";
import { formatCalendarTime, formatLocation, koreaToday } from "@/lib/shared-calendar/calendar";
import { calendarContext, loadCalendarEvents } from "@/lib/shared-calendar/server";
import { loadCalendarWebinars } from "@/lib/shared-calendar/sources-server";
import { loadBusinessTripDashboardSummary } from "@/lib/business-trip-reports/server";

function errorMessage(section: string) {
  return `${section} 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.`;
}

function todayLabel(today: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${today}T00:00:00+09:00`));
}

export default async function HomePage() {
  const context = await calendarContext().catch(() => null);
  if (!context) redirect("/login");

  const today = koreaToday();
  const range = { from: today, to: today };
  const [tripReportsResult, coursesResult, wbsResult, eventsResult, webinarsResult, leavesResult, externalMarketingResult, menuSearchResult] = await Promise.allSettled([
    loadBusinessTripDashboardSummary(context.workspaceId),
    getCachedCourseSummaries(context.workspaceId),
    loadCourseWbsBootstrap(context.workspaceId),
    loadCalendarEvents(context.supabase, context.workspaceId, range),
    loadCalendarWebinars(context.supabase, context.workspaceId, range),
    loadDashboardLeaves(context, today),
    loadExternalMarketingProjects(context.workspaceId),
    loadDashboardMenuSearchKeywordSettings(context.workspaceId),
  ]);

  const errors: Partial<Record<"tripReports" | "courses" | "wbs" | "schedules" | "leaves" | "externalMarketing", string>> = {};

  const businessTrips = tripReportsResult.status === "fulfilled"
    ? tripReportsResult.value
    : { unpaidCount: 0, unpaidCost: 0 };
  if (tripReportsResult.status === "rejected") errors.tripReports = errorMessage("출장보고");

  const loadedCourses = coursesResult.status === "fulfilled" ? coursesResult.value : [];
  const courses: DashboardCourse[] = coursesResult.status === "fulfilled"
    ? loadedCourses
      .filter((course) => course.status === "ongoing")
      .map((course) => ({
        id: course.id,
        name: course.name,
        instructor: course.instructor_name,
        cohort: formatDashboardCohort(course.cohort),
        webinarDate: formatDashboardWebinarDate(course.free_webinar_at),
        countdown: formatWebinarCountdown(course.free_webinar_at, today),
      }))
    : [];
  const searchCourses = (["ongoing", "completed"] as const).flatMap((status) =>
    loadedCourses
      .filter((course) => course.status === status)
      .map((course) => ({
        id: course.id,
        name: course.name,
        instructor: course.instructor_name,
        cohort: formatDashboardCohort(course.cohort),
        webinarDate: formatDashboardWebinarDate(course.free_webinar_at),
        status,
      })),
  );
  if (coursesResult.status === "rejected") errors.courses = errorMessage("강의");

  const wbsTasks: DashboardWbsTask[] = [];
  const preparationCourses: DashboardCoursePreparation[] = [];
  if (wbsResult.status === "fulfilled") {
    preparationCourses.push(...buildDashboardCoursePreparation(
      wbsResult.value.courses,
      wbsResult.value.schedules,
      wbsResult.value.template.items,
      today,
    ).map(({ webinarAt, ...course }) => ({
      ...course,
      cohort: formatDashboardCohort(course.cohort),
      webinarDate: formatDashboardWebinarDate(webinarAt),
      countdown: formatWebinarCountdown(webinarAt ?? "", today),
    })));
    const courseById = new Map(wbsResult.value.courses.map((course) => [course.id, course]));
    const ongoingCourseIds = new Set(wbsResult.value.courses.filter((course) => course.status === "ongoing").map((course) => course.id));
    const tasks = [
      ...wbsResult.value.dashboard.overdueTasks.map((task) => ({ ...task, timing: "overdue" as const })),
      ...wbsResult.value.dashboard.upcomingTasks.map((task) => ({
        ...task,
        timing: task.scheduledDate === today ? "today" as const : "upcoming" as const,
      })),
    ];
    wbsTasks.push(...tasks
      .filter((task) => ongoingCourseIds.has(task.courseId))
      .map((task) => {
        const course = courseById.get(task.courseId);
        return {
          courseId: task.courseId,
          itemId: task.itemId,
          instructorName: course?.instructorName ?? "",
          courseName: course?.name ?? "강의 정보 없음",
          title: task.title,
          owner: task.owner,
          scheduledDate: task.scheduledDate,
          timing: task.timing,
        };
      }));
  } else {
    errors.wbs = errorMessage("WBS");
  }

  const schedules: DashboardSchedule[] = [];
  if (eventsResult.status === "fulfilled") {
    schedules.push(...eventsResult.value.map((event) => ({
      id: `event:${event.id}`,
      title: event.title,
      time: formatCalendarTime(event),
      detail: event.course?.name ?? event.meeting_type.name,
      location: formatLocation(event.location_kind, event.location_text),
      href: "/calendar",
      startMinutes: event.time_tbd ? 1440 : event.start_minutes,
    })));
  }
  if (webinarsResult.status === "fulfilled") {
    schedules.push(...webinarsResult.value.map((event) => ({
      id: event.id,
      title: event.title.replace(/^웨비나 · /u, ""),
      time: event.time_label,
      detail: "무료 웨비나",
      location: "온라인",
      href: event.href,
      startMinutes: event.start_minutes,
    })));
  }
  schedules.sort((left, right) => left.startMinutes - right.startMinutes || left.title.localeCompare(right.title, "ko"));
  if (eventsResult.status === "rejected" && webinarsResult.status === "rejected") errors.schedules = errorMessage("오늘 일정");

  const leaves = leavesResult.status === "fulfilled" ? leavesResult.value : [];
  if (leavesResult.status === "rejected") errors.leaves = errorMessage("휴가자");

  const externalMarketing = externalMarketingResult.status === "fulfilled"
    ? activeExternalMarketingCourses(externalMarketingResult.value)
    : [];
  if (externalMarketingResult.status === "rejected") errors.externalMarketing = errorMessage("외부 마케팅");

  return (
    <CourseDashboard
      data={{
        userName: context.user.displayName ?? "사용자",
        todayLabel: todayLabel(today),
        courses,
        searchCourses,
        menuSearchKeywords: menuSearchResult.status === "fulfilled" ? menuSearchResult.value.keywords : {},
        businessTrips,
        preparationCourses,
        wbsTasks,
        schedules,
        leaves,
        externalMarketing,
        errors,
      }}
    />
  );
}
