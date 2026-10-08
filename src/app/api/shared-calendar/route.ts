import { calendarContext, calendarFailure, calendarResponse, loadCalendarEvents, loadMeetingTypes, readCalendarBody, saveCalendarEvent, validateRange } from "@/lib/shared-calendar/server";
import { calendarLeaveOption, loadCalendarSources } from "@/lib/shared-calendar/sources-server";

export async function GET(request: Request) {
  try {
    const context = await calendarContext();
    const params = new URL(request.url).searchParams;
    const range = validateRange(params.get("from"), params.get("to"));
    const includeLeaves = calendarLeaveOption(params.get("includeLeaves"));
    const [events, meetingTypes, sourceResult] = await Promise.all([
      loadCalendarEvents(context.supabase, context.workspaceId, range),
      loadMeetingTypes(context.supabase, context.workspaceId),
      loadCalendarSources(context, range, includeLeaves),
    ]);
    return calendarResponse({ events, meetingTypes, ...sourceResult });
  } catch (error) { return calendarFailure(error); }
}

export async function POST(request: Request) {
  try {
    const context = await calendarContext();
    const event = await saveCalendarEvent(context, await readCalendarBody(request));
    return calendarResponse({ event }, 201);
  } catch (error) { return calendarFailure(error); }
}
