import { getCachedCourseSummaries } from "@/lib/course-operations/list-cache";
import { formatDashboardCohort, formatDashboardWebinarDate } from "@/lib/dashboard/course-metadata";
import { loadDashboardMenuSearchKeywordSettings } from "@/lib/admin/menu-search-keywords-storage";
import { calendarContext, calendarFailure, calendarResponse } from "@/lib/shared-calendar/server";

export async function GET(){
  try{
    const context=await calendarContext();
    const [courses,settings]=await Promise.all([getCachedCourseSummaries(context.workspaceId),loadDashboardMenuSearchKeywordSettings(context.workspaceId)]);
    return calendarResponse({courses:(["ongoing","completed"] as const).flatMap(status=>courses.filter(course=>course.status===status).map(course=>({id:course.id,name:course.name,instructor:course.instructor_name,cohort:formatDashboardCohort(course.cohort),webinarDate:formatDashboardWebinarDate(course.free_webinar_at),status}))),customKeywords:settings.keywords});
  }catch(error){return calendarFailure(error);}
}
