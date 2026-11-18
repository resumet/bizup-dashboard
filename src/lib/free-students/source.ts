import "server-only";
import { fetchAdminCoursePage } from "../bizup-admin/course-page";
import { parseApplicants } from "./model";

export { resolveFreeCourseId } from "../bizup-admin/course-page";

export async function fetchApplicants(link: string, request: typeof fetch = fetch) {
  const { text } = await fetchAdminCoursePage(link, "apply", request);
  return parseApplicants(text);
}
