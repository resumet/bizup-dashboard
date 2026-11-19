import { addMeetingType, calendarContext, calendarFailure, calendarResponse, readCalendarBody, updateMeetingTypeColor } from "@/lib/shared-calendar/server";

export async function POST(request: Request) {
  try {
    const context = await calendarContext(true);
    return calendarResponse({ meetingType: await addMeetingType(context, await readCalendarBody(request)) }, 201);
  } catch (error) { return calendarFailure(error); }
}

export async function PATCH(request: Request) {
  try {
    const context = await calendarContext(true);
    return calendarResponse({ meetingType: await updateMeetingTypeColor(context, await readCalendarBody(request)) });
  } catch (error) { return calendarFailure(error); }
}
