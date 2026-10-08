import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createBrowserClient } from "@supabase/ssr";
import { AuthApiError, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUser } from "./auth";
import { inviteRedirectScript } from "./invite-redirect-script";
import { acceptInviteSession, readInviteTokens } from "./invite-session";
import { createRouteClient } from "./route-client";

const tokens = { access_token: "test-access-token", refresh_token: "test-refresh-token" };
const account = { id: "invited-user", app_metadata: {} } as User;
const fragment = "#" + new URLSearchParams({ ...tokens, type: "invite" });

test("기본 초대 fragment에서 세션 토큰만 읽고 외부 이동 인자는 무시한다", () => {
  assert.deepEqual(readInviteTokens(fragment + "&next=https://attacker.invalid"), tokens);
  for (const hash of ["", "#section", "#type=invite", fragment.replace("type=invite", "type=recovery"), fragment + "&type=invite", fragment + "&error_code=otp_expired", fragment + "&access_token=duplicate", fragment.replace("test-refresh-token", "%20"), "#type=invite&access_token=" + "a".repeat(32769)]) {
    assert.equal(readInviteTokens(hash), null);
  }
});

function bootstrap(pathname: string, hash: string) {
  const destinations: string[] = [];
  const cleanups: string[] = [];
  runInNewContext(inviteRedirectScript, {
    URLSearchParams,
    window: {
      location: { pathname, hash, search: "", replace: (path: string) => destinations.push(path) },
      history: { state: null, replaceState: (_state: unknown, _title: string, path: string) => cleanups.push(path) },
    },
  });
  return { destinations, cleanups };
}

test("초기 스크립트는 홈·로그인·기타 화면의 초대를 고정 콜백으로 보내고 루프나 일반 anchor 변경을 만들지 않는다", () => {
  for (const path of ["/", "/login", "/work", "/set-password"]) {
    assert.deepEqual(bootstrap(path, fragment).destinations, ["/auth/callback" + fragment]);
  }
  assert.deepEqual(bootstrap("/auth/callback", fragment).destinations, []);
  for (const hash of ["", "#section", "#type=recovery&access_token=other", "#type=magiclink&access_token=other"]) {
    assert.deepEqual(bootstrap("/login", hash), { destinations: [], cleanups: [] });
  }
});

test("Supabase의 타입 없는 만료·재사용 오류는 원본 메시지와 토큰을 제거한 뒤 안전한 오류 화면으로 보낸다", () => {
  for (const hash of ["#error=access_denied&error_code=otp_expired&error_description=private-details", "#type=invite&access_token=" + "a".repeat(32769)]) {
    const result = bootstrap("/login", hash);
    assert.deepEqual(result.cleanups, ["/login"]);
    assert.deepEqual(result.destinations, ["/auth/invite-error?reason=invalid"]);
  }
});

function authClient(verified: User | null = account, error: AuthApiError | null = null, current = verified) {
  let imports = 0;
  let signOuts = 0;
  const client = { auth: {
    getUser: async (token?: string) => ({ data: { user: token ? verified : current }, error }),
    setSession: async (value: typeof tokens) => {
      assert.deepEqual(value, tokens);
      imports += 1;
      return { data: { session: { user: verified }, user: verified }, error: null };
    },
    signOut: async ({ scope }: { scope: string }) => {
      assert.equal(scope, "local");
      signOuts += 1;
      return { error: null };
    },
  } } as unknown as SupabaseClient;
  return { client, imports: () => imports, signOuts: () => signOuts };
}

test("변조·만료·비활성 초대는 기존 세션을 교체하거나 로그아웃하지 않는다", async () => {
  for (const [user, error, reason] of [
    [null, new AuthApiError("private-details", 401, "bad_jwt"), "invalid"],
    [{ ...account, app_metadata: { account_disabled: true } }, null, "disabled"],
    [null, new AuthApiError("private-details", 503, "unexpected_failure"), "unavailable"],
  ] as const) {
    const auth = authClient(user, error);
    assert.deepEqual(await acceptInviteSession(auth.client, tokens), { ok: false, reason });
    assert.equal(auth.imports(), 0);
    assert.equal(auth.signOuts(), 0);
  }
});

test("새 세션도 서버에서 계정을 확인하며 비활성 상태와 다른 탭의 계정 변경을 차단한다", async () => {
  const good = authClient();
  assert.deepEqual(await acceptInviteSession(good.client, tokens), { ok: true });
  assert.equal(good.imports(), 1);
  const changed = authClient(account, null, { ...account, id: "other-account" });
  assert.deepEqual(await acceptInviteSession(changed.client, tokens), { ok: false, reason: "invalid" });
  const disabled = authClient(account, null, { ...account, app_metadata: { account_disabled: true } });
  assert.deepEqual(await acceptInviteSession(disabled.client, tokens), { ok: false, reason: "disabled" });
  assert.equal(disabled.signOuts(), 1);
});

test("세션 저장 실패와 네트워크 예외는 민감한 오류를 노출하지 않는다", async () => {
  const auth = authClient();
  auth.client.auth.setSession = async () => ({ data: { session: null, user: null }, error: new AuthApiError("secret", 401, "bad_jwt") });
  assert.deepEqual(await acceptInviteSession(auth.client, tokens), { ok: false, reason: "invalid" });
  auth.client.auth.getUser = async () => { throw new Error("private transport data"); };
  assert.deepEqual(await acceptInviteSession(auth.client, tokens), { ok: false, reason: "unavailable" });
});

test("기본 초대 세션은 실제 브라우저 SSR 클라이언트로 분할 쿠키에 저장하고 다음 서버 요청에서 같은 계정을 인증한다", async (t) => {
  const url = "https://invite-test.supabase.co";
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  });
  const user = { ...account, id: "621b5b04-e969-46a5-9d12-0e2c31bf42d6", email: "invite@example.invalid", aud: "authenticated", role: "authenticated", created_at: "2026-10-08T00:00:00Z", user_metadata: { padding: "x".repeat(6000) } };
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const credentials = { access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.dGVzdC1zaWduYXR1cmU`, refresh_token: tokens.refresh_token };
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    assert.match(String(input), /\/auth\/v1\/user$/u);
    return Response.json(user);
  });
  const jar = new Map<string, string>();
  const browser = createBrowserClient(url, "test-public-key", {
    isSingleton: false,
    auth: { autoRefreshToken: false, detectSessionInUrl: false },
    cookies: {
      getAll: () => Array.from(jar, ([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => { if (value) jar.set(name, value); else jar.delete(name); }),
    },
  });
  assert.deepEqual(await acceptInviteSession(browser, credentials), { ok: true });
  assert.ok(jar.size >= 2, "all large-session chunks must be persisted before navigation");
  const request = new NextRequest("https://app.example.invalid/set-password", { headers: { cookie: Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ") } });
  const authenticated = await getAuthenticatedUser(createRouteClient(request, NextResponse.next()));
  assert.equal(authenticated?.id, user.id);
});
