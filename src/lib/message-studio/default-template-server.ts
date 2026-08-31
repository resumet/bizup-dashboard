import "server-only";

import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/message-studio/default-messages";
import { allResourcePositions } from "@/lib/message-studio/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type DefaultMessageTemplate = { position: number; content: string };

export async function requireMessageTemplateWorkspace(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`워크스페이스 조회 실패: ${error.code}`);
  if (!data) throw new Error("워크스페이스 권한이 없습니다.");
  return data.workspace_id;
}

export async function ensureDefaultMessageTemplates(userId: string) {
  const admin = createAdminClient();
  const workspaceId = await requireMessageTemplateWorkspace(userId);
  const { data, error } = await admin
    .from("message_studio_default_templates")
    .select("position,content")
    .eq("workspace_id", workspaceId)
    .order("position");
  if (error) {
    throw new Error(
      /PGRST20[45]|42P01/u.test(error.code)
        ? "기본 문자 템플릿 DB 마이그레이션을 적용해 주세요."
        : `기본 템플릿 조회 실패: ${error.code}`,
    );
  }
  if ((data ?? []).length === 0) {
    const { error: insertError } = await admin
      .from("message_studio_default_templates")
      .insert(
        allResourcePositions().map((position) => ({
          workspace_id: workspaceId,
          position,
          content: DEFAULT_MESSAGE_TEMPLATES[position - 1] ?? "",
          created_by: userId,
        })),
      );
    if (insertError)
      throw new Error(`기본 템플릿 초기화 실패: ${insertError.code}`);
    return {
      workspaceId,
      templates: allResourcePositions().map((position) => ({
        position,
        content: DEFAULT_MESSAGE_TEMPLATES[position - 1] ?? "",
      })),
    };
  }
  return { workspaceId, templates: data as DefaultMessageTemplate[] };
}
