import { listWebinarCourses, webinarClient, webinarErrorResponse } from "@/lib/course-webinars/server";
export async function GET() {
  try { return Response.json({ items: await listWebinarCourses(await webinarClient()) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return webinarErrorResponse(error); }
}
