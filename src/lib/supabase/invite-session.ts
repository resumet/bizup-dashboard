import type { SupabaseClient } from "@supabase/supabase-js";

import { isAccountDisabled } from "@/lib/admin/account-status";

type InviteTokens = { access_token: string; refresh_token: string };
type InviteAuthClient = { auth: Pick<SupabaseClient["auth"], "getUser" | "setSession" | "signOut"> };
type InviteSessionResult = { ok: true } | { ok: false; reason: "invalid" | "disabled" | "unavailable" };

export function readInviteTokens(hash: string): InviteTokens | null {
  if (hash.length > 32768) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.getAll("type").length !== 1 || params.get("type") !== "invite") return null;
  if (["error", "error_code", "error_description"].some((key) => params.has(key))) return null;

  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (params.getAll("access_token").length !== 1 || params.getAll("refresh_token").length !== 1) return null;
  if (!access_token || !refresh_token || access_token.length > 16384 || refresh_token.length > 4096) return null;
  if (/\s/u.test(access_token) || /\s/u.test(refresh_token)) return null;
  return { access_token, refresh_token };
}

function failed(error: { name?: string; status?: number } | null): InviteSessionResult {
  const unavailable = error?.name === "AuthRetryableFetchError" || error?.status === 0 || (error?.status ?? 0) >= 500;
  return { ok: false, reason: unavailable ? "unavailable" : "invalid" };
}

/** Import the default email's session into SSR cookies, not localStorage. */
export async function acceptInviteSession(supabase: InviteAuthClient, tokens: InviteTokens): Promise<InviteSessionResult> {
  try {
    // Validate the incoming account before replacing any existing browser session.
    // Neither URL parameters nor editable user_metadata are authorization evidence.
    const verified = await supabase.auth.getUser(tokens.access_token);
    if (verified.error || !verified.data.user) return failed(verified.error);
    if (isAccountDisabled(verified.data.user)) return { ok: false, reason: "disabled" };

    const imported = await supabase.auth.setSession(tokens);
    if (imported.error || !imported.data.session || !imported.data.user) return failed(imported.error);

    const current = await supabase.auth.getUser();
    if (current.error || !current.data.user) return failed(current.error);
    if (current.data.user.id !== verified.data.user.id) return { ok: false, reason: "invalid" };
    if (isAccountDisabled(current.data.user)) {
      await supabase.auth.signOut({ scope: "local" });
      return { ok: false, reason: "disabled" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
