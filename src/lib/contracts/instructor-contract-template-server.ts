import "server-only";

import {
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  type InstructorContractTemplate,
} from "@/lib/contracts/instructor-contract";
import { parseInstructorContractTemplate } from "@/lib/contracts/instructor-contract-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loadInstructorContractTemplate(workspaceId: string) {
  const { data, error } = await createAdminClient()
    .from("instructor_contract_templates")
    .select("template")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return parseInstructorContractTemplate(data?.template)
    ?? DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE;
}

export async function saveInstructorContractTemplate(
  workspaceId: string,
  userId: string,
  template: InstructorContractTemplate,
) {
  const { data, error } = await createAdminClient()
    .from("instructor_contract_templates")
    .upsert({ workspace_id: workspaceId, template, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" })
    .select("template")
    .single();
  if (error) throw error;
  const savedTemplate = parseInstructorContractTemplate(data.template);
  if (!savedTemplate) throw new Error("저장된 계약서 템플릿 형식이 올바르지 않습니다.");
  return savedTemplate;
}
