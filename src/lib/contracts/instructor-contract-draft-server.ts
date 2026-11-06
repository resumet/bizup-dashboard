import "server-only";

import type { InstructorContractValues } from "@/lib/contracts/instructor-contract";
import { parseInstructorContractValues } from "@/lib/contracts/instructor-contract-validation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loadInstructorContractDraft(workspaceId: string, userId: string) {
  const { data, error } = await createAdminClient()
    .from("instructor_contract_drafts")
    .select("values,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const values = parseInstructorContractValues(data?.values);
  return values
    ? { values, updatedAt: data?.updated_at as string }
    : null;
}

export async function saveInstructorContractDraft(
  workspaceId: string,
  userId: string,
  values: InstructorContractValues,
) {
  const { data, error } = await createAdminClient()
    .from("instructor_contract_drafts")
    .upsert({ workspace_id: workspaceId, user_id: userId, values, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,user_id" })
    .select("updated_at")
    .single();
  if (error) throw error;
  return data.updated_at as string;
}
