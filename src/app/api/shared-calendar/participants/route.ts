import { calendarContext, calendarFailure, calendarResponse, loadCalendarPeople } from "@/lib/shared-calendar/server";

export async function GET() {
  try {
    const context = await calendarContext();
    return calendarResponse({ people: await loadCalendarPeople(context.workspaceId) });
  } catch (error) { return calendarFailure(error); }
}
