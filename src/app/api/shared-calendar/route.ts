import { calendarContext, calendarFailure, calendarResponse, loadCalendarEvents, loadMeetingTypes, readCalendarBody, saveCalendarEvent, validateRange } from "@/lib/shared-calendar/server";

export async function GET(request: Request) {
  try {
    const context = await calendarContext();
    const params = new URL(request.url).searchParams;
    const range = validateRange(params.get("from"), params.get("to"));
    const [events, meetingTypes] = await Promise.all([
      loadCalendarEvents(context.supabase, context.workspaceId, range),
      loadMeetingTypes(context.supabase, context.workspaceId),
    ]);
    return calendarResponse({ events, meetingTypes });
  } catch (error) { return calendarFailure(error); }
}

export async function POST(request: Request) {
  try {
    const context = await calendarContext();
    const event = await saveCalendarEvent(context, await readCalendarBody(request));
    return calendarResponse({ event }, 201);
  } catch (error) { return calendarFailure(error); }
}
