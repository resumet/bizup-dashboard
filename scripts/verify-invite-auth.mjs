import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import nextEnv from "@next/env";

// Tests the production build with an isolated fake Auth backend, without email
// delivery, real user creation, database changes, or real password updates.
nextEnv.loadEnvConfig(process.cwd());
const upstream = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const moduleArg = process.argv.indexOf("--playwright-module");
const require = createRequire(import.meta.url);
const modulePath = moduleArg >= 0 ? process.argv[moduleArg + 1] : require.resolve("playwright");
const { chromium } = await import(pathToFileURL(modulePath).href);

const users = [
  { id: "b74cd616-bb32-4df0-a924-4965b6f7fd45", email: "invited@example.invalid" },
  { id: "c26a03b8-4ec9-46bb-a2f9-eeb93c611ff6", email: "existing@example.invalid" },
].map((user) => ({ ...user, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-10-08T00:00:00Z", email_confirmed_at: "2026-10-08T00:00:00Z" }));
let savedPassword = "InitialPassword!1";
let updates = 0;
let inviteUsed = false;
const defaultInvitesUsed = new Set();
let unavailableAuth = false;
let disabledInvite = false;

function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", exp: now + 3600, iat: now })).toString("base64url");
  const signature = createHmac("sha256", "local-test-only-signing-key").update(`${header}.${payload}`).digest("base64url");
  return { access_token: `${header}.${payload}.${signature}`, refresh_token: "local-test-refresh-token", token_type: "bearer", expires_in: 3600, user };
}

const fixture = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  function send(status, data) {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(data === undefined ? undefined : JSON.stringify(data));
  }
  if (url.pathname === "/auth/v1/verify") {
    if (request.method === "GET") {
      // Mimic the uneditable default ConfirmationURL: Supabase consumes the
      // invite and redirects to Site URL (or redirect_to) with fragment tokens.
      const destination = new URL(url.searchParams.get("redirect_to") || appOrigin);
      assert.equal(destination.origin, appOrigin, "test redirects must stay local");
      const token = url.searchParams.get("token");
      if (!token?.startsWith("local-default-") || url.searchParams.get("type") !== "invite" || defaultInvitesUsed.has(token)) {
        destination.hash = new URLSearchParams({ error: "access_denied", error_code: "otp_expired", error_description: "Email link is invalid or has expired" }).toString();
      } else {
        defaultInvitesUsed.add(token);
        const issued = session(users[0]);
        destination.hash = new URLSearchParams({ access_token: issued.access_token, refresh_token: issued.refresh_token, token_type: "bearer", expires_in: "3600", type: "invite" }).toString();
      }
      response.writeHead(303, { Location: destination.href, "Cache-Control": "no-store" });
      return response.end();
    }
    if (body.type !== "invite" || body.token_hash !== "local-test-invite" || inviteUsed) {
      return send(403, { code: "otp_expired", msg: "Token has expired or is invalid" });
    }
    inviteUsed = true;
    return send(200, session(users[0]));
  }
  if (url.pathname === "/auth/v1/token") {
    const user = users.find((item) => item.email === body.email);
    if (!user || body.password !== (user.id === users[0].id ? savedPassword : "ExistingPassword!1")) {
      return send(400, { code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    return send(200, session(user));
  }
  if (url.pathname === "/auth/v1/logout") return send(204);
  if (url.pathname === "/auth/v1/user") {
    if (unavailableAuth) return send(503, { code: "unexpected_failure", msg: "private transport details" });
    let user;
    try {
      const payload = String(request.headers.authorization).split(".")[1];
      const id = JSON.parse(Buffer.from(payload, "base64url").toString()).sub;
      user = users.find((item) => item.id === id);
    } catch { /* Invalid or absent test sessions are rejected below. */ }
    if (!user) return send(401, { code: "session_not_found", msg: "Missing session" });
    if (disabledInvite && user.id === users[0].id) return send(200, { ...user, app_metadata: { account_disabled: true } });
    if (request.method === "PUT") {
      updates += 1;
      if (body.password === "RejectedPassword!1") {
        return send(422, { code: "weak_password", msg: "Password is weak", weak_password: { reasons: ["pwned"] } });
      }
      // Keep the request pending long enough to test duplicate submit attempts.
      await new Promise((resolve) => setTimeout(resolve, 250));
      savedPassword = body.password;
    }
    return send(200, user);
  }
  if (url.pathname.startsWith("/rest/v1/")) return send(200, []);
  return send(404, { code: "unexpected_test_endpoint" });
});

await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
const portProbe = createServer();
await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
const appPort = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const appOrigin = `http://127.0.0.1:${appPort}`;
const preload = fileURLToPath(new URL("./fixtures/invite-auth-fetch.mjs", import.meta.url));
const app = spawn(process.execPath, ["--import", pathToFileURL(preload).href, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(appPort)], {
  cwd: process.cwd(), windowsHide: true,
  env: { ...process.env, INVITE_TEST_SUPABASE_ORIGIN: upstream, INVITE_TEST_FIXTURE_ORIGIN: fixtureOrigin },
  stdio: ["ignore", "pipe", "pipe"],
});
let appOutput = "";
app.stdout.on("data", (data) => { appOutput = (appOutput + data.toString()).slice(-4000); });
app.stderr.on("data", (data) => { appOutput = (appOutput + data.toString()).slice(-4000); });
let browser;
let checks = 0;
function passed(label) { checks += 1; console.log(`PASS ${label}`); }

try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (app.exitCode !== null) throw new Error(`Next server exited: ${appOutput}`);
    try { ready = (await fetch(`${appOrigin}/login`)).ok; } catch { /* The server may still be starting. */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Next production server must become ready");
  browser = await chromium.launch({ headless: true });
  async function newContext() {
    const context = await browser.newContext();
    await context.route(`${upstream}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const result = await fetch(new URL(url.pathname + url.search, fixtureOrigin), {
        method: request.method(), headers: request.headers(), body: request.postData() || undefined, redirect: "manual",
      });
      const headers = { "Content-Type": "application/json" };
      if (result.headers.has("location")) headers.Location = result.headers.get("location");
      await route.fulfill({ status: result.status, headers, body: await result.text() });
    });
    return context;
  }
  function defaultInvite(token, landing = "/") {
    return `${upstream}/auth/v1/verify?token=${token}&type=invite&redirect_to=${encodeURIComponent(appOrigin + landing)}`;
  }
  async function openInvite(page, url) {
    // The bootstrap can replace the document before page.goto's load event.
    await page.goto(url, { waitUntil: "commit" });
    await page.waitForURL("**/set-password");
    assert.equal(await page.getByLabel("계정 이메일").inputValue(), users[0].email);
    assert.equal(new URL(page.url()).hash, "");
  }
  const context = await newContext();
  const page = await context.newPage();
  await page.goto(`${appOrigin}/set-password`);
  await page.waitForURL("**/auth/invite-error?reason=session");
  assert.ok(await page.getByRole("heading", { name: "초대를 확인할 수 없습니다" }).isVisible());
  passed("unauthenticated password page is guarded on the server");

  await page.goto(`${appOrigin}/login`);
  await page.getByLabel("이메일", { exact: true }).fill(users[1].email);
  await page.getByLabel("비밀번호", { exact: true }).fill("ExistingPassword!1");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL(appOrigin + "/");
  passed("existing account login is preserved");

  await openInvite(page, defaultInvite("local-default-main", "/?next=https://attacker.invalid"));
  passed("default invite at Site URL replaces a different existing account and keeps the SSR session");
  const callbackResponse = await fetch(`${appOrigin}/auth/callback`);
  assert.match(callbackResponse.headers.get("cache-control"), /no-store/u);
  assert.equal(callbackResponse.headers.get("referrer-policy"), "no-referrer");
  assert.match(callbackResponse.headers.get("x-robots-tag"), /noindex/u);
  passed("public fragment callback disables caching, referrers and indexing");

  await page.getByLabel("새 비밀번호", { exact: true }).fill("NewPassword!1");
  await page.getByLabel("비밀번호 확인", { exact: true }).fill("Mismatch!1");
  await page.getByRole("button", { name: "비밀번호 저장", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "일치하지 않습니다" }).waitFor();
  assert.equal(updates, 0);
  passed("mismatch is rejected without an update request");

  await page.getByLabel("새 비밀번호", { exact: true }).fill("RejectedPassword!1");
  await page.getByLabel("비밀번호 확인", { exact: true }).fill("RejectedPassword!1");
  await page.getByRole("button", { name: "비밀번호 저장", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "보안 정책" }).waitFor();
  assert.equal(updates, 1);
  passed("Supabase password rejection is shown and permits retry");

  await page.getByLabel("새 비밀번호", { exact: true }).fill("NewPassword!1");
  await page.getByLabel("비밀번호 확인", { exact: true }).fill("NewPassword!1");
  await page.locator("form").evaluate((form) => { form.requestSubmit(); form.requestSubmit(); });
  await page.waitForURL(appOrigin + "/");
  assert.equal(updates, 2, "two immediate submits must produce only one successful update");
  passed("duplicate submits are blocked and successful setup enters the home page");

  await page.getByRole("button", { name: `${users[0].email} 계정 메뉴` }).click();
  await page.getByRole("menuitem", { name: "로그아웃", exact: true }).click();
  await page.waitForURL("**/login");
  await page.getByLabel("이메일", { exact: true }).fill(users[0].email);
  await page.getByLabel("비밀번호", { exact: true }).fill("InitialPassword!1");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "이메일 또는 비밀번호가 올바르지 않습니다" }).waitFor();
  passed("the old password is rejected by the existing login form");
  await page.getByLabel("비밀번호", { exact: true }).fill("NewPassword!1");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForURL(appOrigin + "/");
  passed("logout and login with the newly set password work");

  await page.goto(defaultInvite("local-default-main"), { waitUntil: "commit" });
  await page.waitForURL("**/auth/invite-error?reason=invalid");
  assert.ok(await page.getByText("초대 링크가 올바르지 않거나", { exact: false }).isVisible());
  passed("a reused default invite's type-less error fragment displays the dedicated error page");

  const anonymous = await newContext();
  const landingPage = await anonymous.newPage();
  const appRequests = [];
  landingPage.on("request", (request) => { if (request.url().startsWith(appOrigin)) appRequests.push(request.url()); });
  await openInvite(landingPage, defaultInvite("local-default-anonymous-home"));
  passed("an anonymous default invite at root survives the server login redirect");
  await anonymous.clearCookies();
  await openInvite(landingPage, defaultInvite("local-default-anonymous-login", "/login"));
  passed("an anonymous default invite arriving at login reaches password setup");
  await anonymous.clearCookies();
  await openInvite(landingPage, defaultInvite("local-default-direct-callback", "/auth/callback"));
  passed("a default invite can also target the public callback directly");
  await openInvite(landingPage, defaultInvite("local-default-signed-in-login", "/login"));
  passed("a signed-in login landing preserves the invitation across its server home redirect");
  assert.ok(appRequests.every((value) => !/[?&](access_token|refresh_token)=/u.test(value)), "credentials must never be moved into request query strings");
  assert.deepEqual(await landingPage.evaluate(() => Object.keys(localStorage).filter((key) => key.includes("auth-token"))), []);
  passed("default credentials stay out of HTTP query strings and localStorage");

  await landingPage.goto(`${appOrigin}/auth/callback#type=invite&access_token=malformed&refresh_token=malformed`, { waitUntil: "commit" });
  await landingPage.waitForURL("**/auth/invite-error?reason=invalid");
  await landingPage.goto(appOrigin);
  assert.ok(await landingPage.getByRole("button", { name: `${users[0].email} 계정 메뉴` }).isVisible());
  passed("a tampered default invite is rejected without replacing the existing session");

  await landingPage.goto(`${appOrigin}/auth/callback`, { waitUntil: "commit" });
  await landingPage.waitForURL("**/auth/invite-error?reason=invalid");
  passed("a public callback without fragment credentials cannot reuse an existing session as an invite");

  await anonymous.clearCookies();
  unavailableAuth = true;
  await landingPage.goto(defaultInvite("local-default-retry", "/auth/callback"), { waitUntil: "commit" });
  await landingPage.getByRole("button", { name: "다시 시도", exact: true }).waitFor();
  assert.equal(new URL(landingPage.url()).hash, "");
  unavailableAuth = false;
  await landingPage.getByRole("button", { name: "다시 시도", exact: true }).click();
  await landingPage.waitForURL("**/set-password");
  passed("network failure permits retry from memory after clearing the URL credentials");

  await anonymous.clearCookies();
  disabledInvite = true;
  await landingPage.goto(defaultInvite("local-default-disabled", "/auth/callback"), { waitUntil: "commit" });
  await landingPage.waitForURL("**/auth/invite-error?reason=disabled");
  assert.ok((await anonymous.cookies()).every((cookie) => !cookie.name.includes("auth-token")));
  disabledInvite = false;
  passed("a disabled invited account cannot import a browser session");
  await anonymous.close();

  await page.goto(`${appOrigin}/auth/confirm?token_hash=local-test-invite&type=invite&next=https://attacker.invalid`);
  await page.waitForURL("**/set-password");
  assert.equal(await page.getByLabel("계정 이메일").inputValue(), users[0].email);
  passed("the optional custom-template server callback remains compatible");
  await page.goto(`${appOrigin}/auth/confirm?token_hash=local-test-invite&type=invite`);
  await page.waitForURL("**/auth/invite-error?reason=invalid");
  passed("the optional custom-template callback still rejects reused tokens");
  console.log(`Invite browser verification: ${checks} checks passed (mock Auth, no production mutations).`);
} finally {
  await browser?.close();
  app.kill();
  await new Promise((resolve) => fixture.close(resolve));
}
