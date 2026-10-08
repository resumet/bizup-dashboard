import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { Button } from "@/components/ui/button";
import { CalendarMeetingTypesManager } from "@/components/admin/calendar-meeting-types-manager";
import { CalendarError, calendarContext, loadMeetingTypes } from "@/lib/shared-calendar/server";

export default async function AdminCalendarPage() {
  const context = await calendarContext(true).catch((error: unknown) => {
    if (error instanceof CalendarError && error.status === 401) redirect("/login");
    if (error instanceof CalendarError && error.status === 403) notFound();
    throw error;
  });
  const result = await loadMeetingTypes(context.supabase, context.workspaceId).then((types) => ({ types, error: "" }), () => ({ types: [], error: "회의 항목을 불러오지 못했습니다. 새로고침해 주세요." }));
  return <main className="min-h-screen">
    <header className="border-b"><div className="mx-auto flex min-h-16 max-w-[1900px] items-center justify-between px-5 py-4 lg:px-8"><BrandHomeLink /><Button asChild variant="outline"><Link href="/calendar">공용캘린더</Link></Button></div></header>
    <div className="mx-auto max-w-[1900px] space-y-6 px-5 py-8 lg:px-8"><h1 className="text-2xl font-semibold">관리자 메뉴</h1><CalendarMeetingTypesManager initialTypes={result.types} loadError={result.error} /></div>
  </main>;
}
