import { addMeetingType, calendarContext, calendarFailure, calendarResponse, readCalendarBody } from "@/lib/shared-calendar/server";

export async function POST(request: Request) {
  try {
    const context = await calendarContext(true);
    return calendarResponse({ meetingType: await addMeetingType(context, await readCalendarBody(request)) }, 201);
  } catch (error) { return calendarFailure(error); }
}
