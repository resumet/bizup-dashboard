import "server-only";

import {
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  isInstructorContractTemplate,
  type InstructorContractTemplate,
} from "@/lib/contracts/instructor-contract";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loadInstructorContractTemplate(workspaceId: string) {
  const { data, error } = await createAdminClient()
    .from("instructor_contract_templates")
    .select("template")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return isInstructorContractTemplate(data?.template)
    ? data.template
    : DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE;
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
  return data.template as InstructorContractTemplate;
}
