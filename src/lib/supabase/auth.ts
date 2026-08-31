import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthenticatedUser = { id: string; email?: string };

export async function getAuthenticatedUser(
  supabase: SupabaseClient,
): Promise<AuthenticatedUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || typeof claims?.sub !== "string" || !claims.sub) return null;
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };
}
