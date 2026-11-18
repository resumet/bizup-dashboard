import "server-only";
import { authorizeFreeStudents, FreeStudentsError, loadFreeStudents } from "./server";
import { fetchApplicants } from "./source";
import { invalidateCourseOperationsList } from "@/lib/course-operations/list-cache";

export async function syncFreeStudents(context: Awaited<ReturnType<typeof authorizeFreeStudents>>) {
  const { admin, user, course } = context;
  const courseId = course.id;
  const before = await loadFreeStudents(admin, courseId);
  const courseLandingPageLink = course.landing_page_link?.trim() ?? "";
  const rows = await fetchApplicants(courseLandingPageLink);
  const currentCourse = await admin.from("courses").select("landing_page_link").eq("id", courseId).single();
  if (currentCourse.error || (currentCourse.data.landing_page_link?.trim() ?? "") !== courseLandingPageLink) throw new FreeStudentsError("강의 링크가 변경되었습니다. 새로고침 후 다시 가져와 주세요.", 409);
  const record = { rows, source_url: courseLandingPageLink, updated_by: user.id, updated_at: new Date().toISOString() };
  const result = before
    ? await admin.from("course_free_students").update(record).eq("course_id", courseId).eq("updated_at", before.updated_at).select("course_id").maybeSingle()
    : await admin.from("course_free_students").insert({ ...record, course_id: courseId }).select("course_id").single();
  if (result.error?.code === "23505" || (!result.error && !result.data)) throw new FreeStudentsError("다른 사용자가 명단을 갱신했습니다. 새로고침해 주세요.", 409);
  if (result.error) throw new FreeStudentsError("명단을 저장하지 못했습니다. 기존 명단은 유지됩니다.", 500);
  invalidateCourseOperationsList();
  return { rows, source_url: record.source_url, updated_at: record.updated_at };
}

export async function clearFreeStudents(context: Awaited<ReturnType<typeof authorizeFreeStudents>>, expectedUpdatedAt: string) {
  const { admin, course } = context;
  if (course.landing_page_link?.trim()) throw new FreeStudentsError("랜딩 링크가 등록되어 있습니다. 명단 가져오기로 새 명단을 갱신해 주세요.", 409);
  const currentCourse = await admin.from("courses").select("landing_page_link").eq("id", course.id).single();
  if (currentCourse.error || currentCourse.data.landing_page_link?.trim()) throw new FreeStudentsError("강의 링크가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", 409);
  const result = await admin.from("course_free_students").delete().eq("course_id", course.id).eq("updated_at", expectedUpdatedAt).select("course_id").maybeSingle();
  if (result.error) throw new FreeStudentsError("기존 무료수강생 명단을 삭제하지 못했습니다.", 500);
  if (!result.data) throw new FreeStudentsError("다른 사용자가 명단을 변경했습니다. 새로고침 후 다시 시도해 주세요.", 409);
  invalidateCourseOperationsList();
  return { deleted: true };
}
