import "server-only";
import { authorizeFreeStudents, FreeStudentsError, loadFreeStudents } from "./server";
import { fetchApplicants } from "./source";
import { invalidateCourseOperationsList } from "@/lib/course-operations/list-cache";

export async function syncFreeStudents(context: Awaited<ReturnType<typeof authorizeFreeStudents>>) {
  const { admin, user, course } = context;
  const courseId = course.id;
  const before = await loadFreeStudents(admin, courseId);
  const rows = await fetchApplicants(course.landing_page_link ?? "");
  const currentCourse = await admin.from("courses").select("landing_page_link").eq("id", courseId).single();
  if (currentCourse.error || currentCourse.data.landing_page_link !== course.landing_page_link) throw new FreeStudentsError("강의 링크가 변경되었습니다. 새로고침 후 다시 가져와 주세요.", 409);
  const record = { rows, source_url: course.landing_page_link, updated_by: user.id, updated_at: new Date().toISOString() };
  const result = before
    ? await admin.from("course_free_students").update(record).eq("course_id", courseId).eq("updated_at", before.updated_at).select("course_id").maybeSingle()
    : await admin.from("course_free_students").insert({ ...record, course_id: courseId }).select("course_id").single();
  if (result.error?.code === "23505" || (!result.error && !result.data)) throw new FreeStudentsError("다른 사용자가 명단을 갱신했습니다. 새로고침해 주세요.", 409);
  if (result.error) throw new FreeStudentsError("명단을 저장하지 못했습니다. 기존 명단은 유지됩니다.", 500);
  invalidateCourseOperationsList();
  return { rows, source_url: record.source_url, updated_at: record.updated_at };
}
