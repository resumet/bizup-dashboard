import { calendarContext, calendarFailure, calendarResponse, deleteCalendarEvent, readCalendarBody, saveCalendarEvent, validateEventId } from "@/lib/shared-calendar/server";

type Context = { params: Promise<{ eventId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const context = await calendarContext();
    const { eventId } = await params;
    validateEventId(eventId);
    return calendarResponse({ event: await saveCalendarEvent(context, await readCalendarBody(request), eventId) });
  } catch (error) { return calendarFailure(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const context = await calendarContext();
    const { eventId } = await params;
    validateEventId(eventId);
    await deleteCalendarEvent(context, eventId, await readCalendarBody(request));
    return calendarResponse({ deleted: true });
  } catch (error) { return calendarFailure(error); }
}
