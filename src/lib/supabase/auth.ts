import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAccountDisabled } from "@/lib/admin/account-status";
import { parseUserDisplayName } from "@/lib/admin/user-names";

export type AuthenticatedUser = { id: string; email?: string; displayName?: string };

export async function getAuthenticatedUser(
  supabase: SupabaseClient,
): Promise<AuthenticatedUser | null> {
  // Read current server-side status; an already-issued JWT can predate deactivation.
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user || isAccountDisabled(user)) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: parseUserDisplayName(user.user_metadata?.display_name) ?? undefined,
  };
}
