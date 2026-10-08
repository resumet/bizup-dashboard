import { calendarContext, calendarFailure, calendarResponse, importCalendarEvents, readCalendarBody } from "@/lib/shared-calendar/server";

export async function POST(request: Request) {
  try {
    const context = await calendarContext();
    const result = await importCalendarEvents(context, await readCalendarBody(request));
    return calendarResponse(result, result.alreadyImported ? 200 : 201);
  } catch (error) { return calendarFailure(error); }
}
