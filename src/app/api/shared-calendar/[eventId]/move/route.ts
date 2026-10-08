import { calendarContext, calendarFailure, calendarResponse, moveCalendarEvent, readCalendarBody, validateEventId } from "@/lib/shared-calendar/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await calendarContext();
    const { eventId } = await params;
    validateEventId(eventId);
    return calendarResponse({ event: await moveCalendarEvent(context, eventId, await readCalendarBody(request)) });
  } catch (error) { return calendarFailure(error); }
}
