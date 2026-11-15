import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import type { FreeStudentsSnapshot } from "./model";

export class FreeStudentsError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export async function authorizeFreeStudents(courseId: string) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) throw new FreeStudentsError("로그인이 필요합니다.", 401);
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(courseId)) throw new FreeStudentsError("강의 ID를 확인해 주세요.");
  const admin = createAdminClient();
  const { data: course, error } = await admin.from("courses").select("id,name,instructor_name,cohort,workspace_id,landing_page_link").eq("id", courseId).maybeSingle();
  if (error) throw new FreeStudentsError("강의를 조회하지 못했습니다.", 500);
  if (!course) throw new FreeStudentsError("강의를 찾을 수 없습니다.", 404);
  const member = await admin.from("workspace_members").select("user_id").eq("workspace_id", course.workspace_id).eq("user_id", user.id).maybeSingle();
  if (member.error) throw new FreeStudentsError("접근 권한을 확인하지 못했습니다.", 500);
  if (!member.data) throw new FreeStudentsError("강의 명단을 관리할 권한이 없습니다.", 403);
  return { admin, user, course };
}

export async function loadFreeStudents(admin: ReturnType<typeof createAdminClient>, courseId: string): Promise<FreeStudentsSnapshot | null> {
  const result = await admin.from("course_free_students").select("rows,source_url,updated_at").eq("course_id", courseId).maybeSingle();
  if (result.error) throw new FreeStudentsError("저장된 무료수강생 명단을 불러오지 못했습니다.", 500);
  return result.data as FreeStudentsSnapshot | null;
}
