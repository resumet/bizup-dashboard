import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { NextRequest, NextResponse } from "next/server";

import { getAuthenticatedUser } from "./auth";
import { confirmInvite } from "./invite-confirmation";
import { createRouteClient } from "./route-client";

const user = {
  id: "621b5b04-e969-46a5-9d12-0e2c31bf42d6", aud: "authenticated",
  role: "authenticated", email: "invite-test@example.invalid",
  app_metadata: {}, user_metadata: { display_name: "x".repeat(6000) },
  created_at: "2026-10-08T00:00:00Z",
};

function useTestAuth(t: TestContext) {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://invite-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  });
}

function testSession(account = user) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: account.id, aud: "authenticated", exp: now + 3600, iat: now })).toString("base64url");
  return { access_token: `${header}.${payload}.dGVzdC1zaWduYXR1cmU`, refresh_token: "test-refresh-token", token_type: "bearer", expires_in: 3600, user: account };
}

test("초대 콜백은 실제 SSR 클라이언트의 분할 쿠키를 리다이렉트에 유지하고 다음 서버 요청에서 같은 사용자를 인증한다", async (t) => {
  useTestAuth(t);
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/verify")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.token_hash, "test-invite-hash");
      assert.equal(body.type, "invite");
      return Response.json(testSession());
    }
    assert.ok(url.endsWith("/user"));
    return Response.json(user);
  });

  const result = await confirmInvite(new NextRequest("https://app.example.invalid/auth/confirm?token_hash=test-invite-hash&type=invite&next=https://attacker.invalid&redirect_to=//attacker.invalid"));
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("location"), "/set-password");
  assert.match(result.headers.get("cache-control") ?? "", /private.*no-store/u);
  assert.equal(result.headers.get("referrer-policy"), "no-referrer");
  const cookies = result.cookies.getAll();
  assert.ok(cookies.length >= 2, "large sessions must keep every cookie chunk");
  assert.ok(cookies.every((cookie) => cookie.path === "/" && cookie.sameSite === "lax"));
  const cookieHeader = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  const nextRequest = new NextRequest("https://app.example.invalid/set-password", { headers: { cookie: cookieHeader } });
  const account = await getAuthenticatedUser(createRouteClient(nextRequest, NextResponse.next()));
  assert.equal(account?.id, user.id);
  assert.equal(account?.email, user.email);
  assert.equal(requests.length, 2);
});

test("누락된 토큰과 초대 외 인증 타입은 Supabase에 요청하지 않고 안전한 오류 화면으로 이동한다", async () => {
  for (const query of ["", "?type=invite", "?token_hash=hash&type=recovery", "?token_hash=hash&type=email", "?token_hash=%20&type=invite"]) {
    const result = await confirmInvite(new NextRequest(`https://app.example.invalid/auth/confirm${query}`), () => {
      throw new Error("must not create a client");
    });
    assert.equal(result.headers.get("location"), "/auth/invite-error?reason=invalid");
    assert.equal(result.cookies.getAll().length, 0);
  }
});

test("만료 또는 재사용한 초대는 기존 계정 세션을 바꾸지 않고 비민감 오류만 반환한다", async (t) => {
  useTestAuth(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: "otp_expired", msg: "Token has expired or is invalid" }, { status: 403 }));
  const result = await confirmInvite(new NextRequest("https://app.example.invalid/auth/confirm?token_hash=expired-secret&type=invite", { headers: { cookie: "existing-session=preserved" } }));
  assert.equal(result.headers.get("location"), "/auth/invite-error?reason=invalid");
  assert.equal(result.cookies.getAll().length, 0);
  assert.ok(!result.headers.get("location")?.includes("expired-secret"));
});

test("초대 확인 서버의 오류와 네트워크 실패는 다시 시도할 수 있는 오류로 처리한다", async (t) => {
  useTestAuth(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({ code: "unexpected_failure", msg: "private details" }, { status: 500 }));
  const result = await confirmInvite(new NextRequest("https://app.example.invalid/auth/confirm?token_hash=hash&type=invite"));
  assert.equal(result.headers.get("location"), "/auth/invite-error?reason=unavailable");
  const thrown = await confirmInvite(new NextRequest("https://app.example.invalid/auth/confirm?token_hash=hash&type=invite"), () => { throw new Error("private details"); });
  assert.equal(thrown.headers.get("location"), result.headers.get("location"));
});

test("비활성 계정의 초대 세션은 로컬 로그아웃하고 쿠키 제거를 오류 응답에 유지한다", async (t) => {
  useTestAuth(t);
  const disabled = { ...user, app_metadata: { account_disabled: true } };
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/verify")) return Response.json(testSession(disabled));
    assert.match(String(input), /\/logout\?scope=local$/u);
    return new Response(null, { status: 204 });
  });
  const result = await confirmInvite(new NextRequest("https://app.example.invalid/auth/confirm?token_hash=hash&type=invite"));
  assert.equal(result.headers.get("location"), "/auth/invite-error?reason=disabled");
  assert.ok(result.cookies.getAll().length > 0);
  assert.ok(result.cookies.getAll().every((cookie) => cookie.value === "" && cookie.maxAge === 0));
});
