import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { isAccountDisabled } from "@/lib/admin/account-status";
import { createRouteClient } from "./route-client";

function privateRedirect(path: string) {
  // Relative Location keeps the browser's origin, even behind a reverse proxy
  // whose internal request URL has a different host from the public site.
  const response = new NextResponse(null, { status: 303 });
  response.headers.set("Location", path);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function confirmInvite(
  request: NextRequest,
  createSupabase = createRouteClient,
) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  // This endpoint deliberately accepts only invites, with a fixed destination.
  if (type !== "invite" || !tokenHash?.trim() || tokenHash.length > 1024) {
    return privateRedirect("/auth/invite-error?reason=invalid");
  }

  const response = privateRedirect("/set-password");
  function fail(reason: "invalid" | "disabled" | "unavailable") {
    // Keep Set-Cookie (including chunked cookies and removals) on this response.
    response.headers.set("Location", `/auth/invite-error?reason=${reason}`);
    return response;
  }

  try {
    const supabase = createSupabase(request, response);
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
    if (error) {
      const unavailable = error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status ?? 0) >= 500;
      return fail(unavailable ? "unavailable" : "invalid");
    }
    if (!data.session || !data.user) return fail("invalid");
    if (isAccountDisabled(data.user)) {
      await supabase.auth.signOut({ scope: "local" });
      return fail("disabled");
    }
    return response;
  } catch {
    // Do not expose or log the URL, token, session, or upstream error payload.
    return fail("unavailable");
  }
}
