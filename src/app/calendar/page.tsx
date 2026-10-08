import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { Button } from "@/components/ui/button";
import { SharedCalendar } from "@/components/shared-calendar/shared-calendar";
import { koreaToday, monthDays, uuidSchema } from "@/lib/shared-calendar/calendar";
import { CalendarError, calendarContext, loadCalendarCourses, loadCalendarEvents, loadMeetingTypes } from "@/lib/shared-calendar/server";
import { loadCalendarSources } from "@/lib/shared-calendar/sources-server";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ courseId?: string }> }) {
  const context = await calendarContext().catch((error: unknown) => {
    if (error instanceof CalendarError && error.status === 401) redirect("/login");
    throw error;
  });
  const { courseId } = await searchParams;
  const today = koreaToday();
  const days = monthDays(today.slice(0, 7));
  const result = await Promise.all([
    loadCalendarEvents(context.supabase, context.workspaceId, { from: days[0], to: days[41] }),
    loadMeetingTypes(context.supabase, context.workspaceId),
    loadCalendarCourses(context.supabase, context.workspaceId),
    loadCalendarSources(context, { from: days[0], to: days[41] }),
  ]).then(([events, types, courses, sources]) => ({ events, types, courses, ...sources, error: "" }), () => ({ events: [], types: [], courses: [], sources: [], sourcesWarning: "", error: "캘린더를 불러오지 못했습니다. 페이지를 새로고침해 주세요." }));
  const selectedCourse = uuidSchema.safeParse(courseId).success && result.courses.some((course) => course.id === courseId) ? courseId : undefined;
  return <main className="min-h-screen">
    <header className="border-b bg-background"><div className="mx-auto flex min-h-16 max-w-[1900px] items-center justify-between gap-3 px-5 py-4 lg:px-8"><BrandHomeLink /><div className="flex items-center gap-2">{context.isAdmin ? <Button asChild variant="outline" size="sm"><Link href="/admin/calendar">회의 항목 추가</Link></Button> : null}<UserAccountMenu email={context.user.email ?? ""} /></div></div></header>
    <div className="mx-auto max-w-[1900px] space-y-2 px-5 py-2 lg:px-8">
      <h1 className="text-2xl font-semibold">공용캘린더</h1>
      <SharedCalendar today={today} currentUserId={context.user.id} initialEvents={result.events} initialSources={result.sources} initialSourcesWarning={result.sourcesWarning} initialTypes={result.types} courses={result.courses} initialError={result.error} initialCourseId={selectedCourse} isAdmin={context.isAdmin} />
    </div>
  </main>;
}
