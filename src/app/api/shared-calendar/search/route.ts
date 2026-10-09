import { calendarContext, calendarFailure, calendarResponse, loadCalendarSearchResults, validateCalendarSearchQuery } from "@/lib/shared-calendar/server";

export async function GET(request: Request) {
  try {
    const context = await calendarContext();
    const query = validateCalendarSearchQuery(new URL(request.url).searchParams.get("q"));
    const results = await loadCalendarSearchResults(context.supabase, context.workspaceId, query);
    return calendarResponse({ results });
  } catch (error) { return calendarFailure(error); }
}
