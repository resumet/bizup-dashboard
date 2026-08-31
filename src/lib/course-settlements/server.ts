import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function getWorkspaceForUser(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("workspace_members").select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
  if (error || !data) throw new Error("워크스페이스 권한이 없습니다.");
  return { admin, workspaceId: data.workspace_id as string };
}

export async function authorizeSettlement(settlementId: string, userId: string) {
  const { admin, workspaceId } = await getWorkspaceForUser(userId);
  const { data, error } = await admin.from("course_settlement_projects").select("*").eq("id", settlementId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error(error.code === "PGRST205" ? "강의별 정산 DB 마이그레이션을 먼저 적용해 주세요." : `정산 조회 실패: ${error.code}`);
  if (!data) throw new Error("정산 프로젝트를 찾을 수 없습니다.");
  return { admin, workspaceId, settlement: data };
}

export function settlementError(error: unknown) {
  console.error("[course-settlement]", error);
  return Response.json({ message: error instanceof Error ? error.message : "정산 요청을 처리하지 못했습니다." }, { status: 400 });
}
