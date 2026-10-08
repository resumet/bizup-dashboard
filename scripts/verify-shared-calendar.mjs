import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { PGlite } from "@electric-sql/pglite";

// Real production-build UI/API with a local Postgres/RLS fixture. No production
// data, Auth accounts, emails, or passwords are created or modified.
nextEnv.loadEnvConfig(process.cwd());
const upstream = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const arg = process.argv.indexOf("--playwright-module");
const modulePath = arg < 0 ? createRequire(import.meta.url).resolve("playwright") : process.argv[arg + 1];
const { chromium } = await import(pathToFileURL(modulePath).href);
const workspace = "00000000-0000-4000-8000-000000000001";
const courseId = "00000000-0000-4000-8000-000000000021";
const users = [
  { id: "00000000-0000-4000-8000-000000000011", email: "calendar-user@example.invalid", accessRole: "user" },
  { id: "00000000-0000-4000-8000-000000000012", email: "calendar-colleague@example.invalid", accessRole: "user" },
  { id: "00000000-0000-4000-8000-000000000013", email: "resumet@gmail.com", accessRole: "admin" },
].map((user, index) => ({ ...user, role: "authenticated", aud: "authenticated", app_metadata: {}, user_metadata: { display_name: ["검증 사용자", "검증 동료", "검증 관리자"][index] }, created_at: "2026-10-08T00:00:00Z", email_confirmed_at: "2026-10-08T00:00:00Z" }));
const course = { id: courseId, workspace_id: workspace, name: "캘린더 검증 강의", instructor_name: "검증 강사", cohort: "1기", free_webinar_at: "2026-10-20T10:00:00Z", starts_at: "2026-10-25T10:00:00Z", required_tasks: [], custom_links: [], updated_at: "2026-10-08T00:00:00Z" };
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}', banned_until timestamptz, email_confirmed_at timestamptz default now());
  create table public.workspaces(id uuid primary key);
  create table public.workspace_members(workspace_id uuid, user_id uuid, role text);
  create table public.courses(id uuid primary key, workspace_id uuid);
  grant usage on schema auth to authenticated;
  grant select on courses to authenticated;
  insert into workspaces values ('${workspace}');
  insert into courses values ('${courseId}', '${workspace}');
`);
for (const user of users) {
  await db.query("insert into auth.users(id,email) values ($1,$2)", [user.id, user.email]);
  await db.query("insert into workspace_members values ($1,$2,$3)", [workspace, user.id, user.accessRole]);
}
await db.exec(await readFile("supabase/migrations/20261008090358_shared_calendar.sql", "utf8"));
await db.exec(await readFile("supabase/migrations/20261008100344_shared_calendar_participants.sql", "utf8"));

function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", exp: now + 3600, iat: now })).toString("base64url");
  const signature = createHmac("sha256", "local-calendar-test-signing-key").update(`${header}.${payload}`).digest("base64url");
  return { access_token: `${header}.${payload}.${signature}`, refresh_token: "local-calendar-refresh-token", expires_in: 3600, token_type: "bearer", user };
}
function requestUser(request) {
  try { return users.find((user) => user.id === JSON.parse(Buffer.from(String(request.headers.authorization).split(".")[1], "base64url").toString()).sub); }
  catch { return undefined; }
}

let serial = Promise.resolve();
function exclusive(callback) {
  const result = serial.then(callback);
  serial = result.catch(() => {});
  return result;
}
let outage = false;
let participantOutage = false;
const fixture = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  const send = (status, value) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(value === undefined ? undefined : JSON.stringify(value)); };
  const user = requestUser(request);
  if (url.pathname === "/auth/v1/token") return send(200, session(users.find((item) => item.email === body.email) ?? users[0]));
  if (url.pathname === "/auth/v1/logout") return send(204);
  if (url.pathname === "/auth/v1/user") return user ? send(200, user) : send(401, { message: "Missing fixture session" });
  if (url.pathname === "/auth/v1/admin/users") return participantOutage ? send(503, { message: "Fixture participant outage" }) : send(200, { users, aud: "authenticated" });
  if (!url.pathname.startsWith("/rest/v1/")) return send(404, { code: "fixture_endpoint_missing" });
  const table = url.pathname.split("/").at(-1);
  if (table === "shared_calendar_events" && url.searchParams.get("select")?.includes("!meeting_type_id(")) {
    // PostgREST cannot use a single-column hint for this composite foreign key.
    return send(400, { code: "PGRST200", message: "Invalid composite relationship hint" });
  }
  const single = String(request.headers.accept).includes("vnd.pgrst.object");
  if (table === "workspace_members") {
    const id = url.searchParams.get("user_id")?.replace(/^eq\./u, "");
    const member = users.find((item) => item.id === id);
    const rows = id ? (member ? [{ user_id: member.id, workspace_id: workspace, role: member.accessRole, workspaces: { is_primary: true } }] : []) : users.map((item) => ({ user_id: item.id, workspace_id: workspace, role: item.accessRole }));
    return send(200, single ? rows[0] ?? null : rows);
  }
  if (table === "courses") return send(200, single ? course : [course]);
  if (!["shared_calendar_events", "shared_calendar_meeting_types"].includes(table)) return send(200, single ? null : []);
  if (outage && request.method === "GET") return send(503, { code: "fixture_outage" });
  try {
    const rows = await exclusive(async () => {
      await db.exec("reset role");
      if (user) { await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user.id]); await db.exec("set role authenticated"); }
      const params = [];
      const clauses = [];
      for (const [key, value] of url.searchParams) {
        if (!["id", "workspace_id", "event_date", "meeting_type_id", "course_id", "version"].includes(key)) continue;
        const match = /^(eq|gte|lte)\.(.+)$/u.exec(value); if (!match) continue;
        params.push(match[2]); clauses.push(`${key} ${({ eq: "=", gte: ">=", lte: "<=" })[match[1]]} $${params.length}`);
      }
      const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
      let result;
      if (request.method === "POST") {
        const keys = Object.keys(body);
        assert.ok(keys.every((key) => /^[a-z_]+$/u.test(key)));
        result = await db.query(`insert into ${table} (${keys.join(",")}) values (${keys.map((_, index) => `$${index + 1}`).join(",")}) returning *`, keys.map((key) => body[key]));
      } else if (request.method === "PATCH") {
        const keys = Object.keys(body);
        assert.ok(keys.every((key) => /^[a-z_]+$/u.test(key)));
        const assignments = keys.map((key, index) => `${key}=$${params.length + index + 1}`).join(",");
        result = await db.query(`update ${table} set ${assignments}${where} returning *`, [...params, ...keys.map((key) => body[key])]);
      } else if (request.method === "DELETE") result = await db.query(`delete from ${table}${where} returning *`, params);
      else result = await db.query(`select * from ${table}${where} order by ${table === "shared_calendar_events" ? "event_date,start_minutes,id" : "created_at,name"} limit 500 offset ${Number(url.searchParams.get("offset") ?? 0)}`, params);
      await db.exec("reset role");
      for (const row of result.rows) {
        if (table === "shared_calendar_events") {
          if (row.event_date instanceof Date) row.event_date = row.event_date.toISOString().slice(0, 10);
          row.meeting_type = (await db.query("select id,name,code from shared_calendar_meeting_types where id=$1", [row.meeting_type_id])).rows[0];
          row.course = row.course_id ? course : null;
        }
      }
      return result.rows;
    });
    return send(200, single ? rows[0] ?? null : rows);
  } catch (error) { return send(error.code === "42501" ? 403 : 400, { code: error.code, message: error.message }); }
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const fixtureOrigin = `http://127.0.0.1:${fixture.address().port}`;
const probe = createServer(); await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const appPort = probe.address().port; await new Promise((resolve) => probe.close(resolve));
const appOrigin = `http://127.0.0.1:${appPort}`;
const preload = fileURLToPath(new URL("./fixtures/invite-auth-fetch.mjs", import.meta.url));
const app = spawn(process.execPath, ["--import", pathToFileURL(preload).href, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(appPort)], {
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PRIMARY_WORKSPACE_ID: workspace, INVITE_TEST_SUPABASE_ORIGIN: upstream, INVITE_TEST_FIXTURE_ORIGIN: fixtureOrigin },
});
let appOutput = "";
for (const stream of [app.stdout, app.stderr]) stream.on("data", (data) => { appOutput = (appOutput + data.toString()).slice(-6000); });
let browser;
let checks = 0;
const passed = (label) => { checks += 1; console.log(`PASS ${label}`); };
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (app.exitCode !== null) throw new Error(`Next exited: ${appOutput}`);
    try { ready = (await fetch(`${appOrigin}/login`)).ok; } catch { /* Starting. */ }
    if (ready) break; await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready);
  browser = await chromium.launch({ headless: true });
  async function login(user, options = {}) {
    const context = await browser.newContext(options);
    await context.route(`${upstream}/**`, async (route) => {
      const req = route.request(); const url = new URL(req.url());
      const result = await fetch(new URL(url.pathname + url.search, fixtureOrigin), { method: req.method(), headers: req.headers(), body: req.postData() || undefined });
      await route.fulfill({ status: result.status, headers: { "Content-Type": "application/json" }, body: await result.text() });
    });
    const page = await context.newPage();
    await page.goto(`${appOrigin}/login`);
    await page.getByLabel("이메일", { exact: true }).fill(user.email);
    await page.getByLabel("비밀번호", { exact: true }).fill("LocalFixtureOnly!1");
    await page.getByRole("button", { name: "로그인", exact: true }).click(); await page.waitForURL(appOrigin + "/");
    return { page, context };
  }
  assert.equal((await fetch(`${appOrigin}/api/shared-calendar?from=2026-10-01&to=2026-10-31`)).status, 401);
  assert.equal((await fetch(`${appOrigin}/api/shared-calendar/participants`)).status, 401);
  assert.equal((await fetch(`${appOrigin}/api/shared-calendar/${courseId}/move`, { method: "PATCH" })).status, 401);
  passed("unauthenticated calendar API returns 401");
  const { page, context } = await login(users[0], { permissions: ["clipboard-read", "clipboard-write"] });
  await page.getByRole("link", { name: /공용캘린더/u }).click();
  await page.getByRole("heading", { name: "공용캘린더", exact: true }).waitFor();
  await page.getByRole("button", { name: "일정 등록", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.getByLabel("시작시간", { exact: true }).locator("option").count(), 27);
  assert.equal(await dialog.getByLabel("소요시간", { exact: true }).locator("option").count(), 48);
  passed("dashboard card opens calendar with 08:00–21:00 starts and half-hour durations");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  const dateCell = page.locator("[data-calendar-date]").nth(10);
  const createdDate = await dateCell.getAttribute("data-calendar-date");
  await dateCell.getByRole("button").click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await dateCell.getByRole("button").dblclick();
  dialog = page.getByRole("dialog"); await dialog.waitFor();
  assert.equal(await dialog.getByLabel("날짜", { exact: true }).inputValue(), createdDate);
  assert.equal(await dialog.getByLabel("소요시간", { exact: true }).inputValue(), "60");
  await dialog.getByLabel("일정 제목", { exact: true }).fill("11시 검증 미팅");
  assert.equal(await dialog.getByLabel("시작시간", { exact: true }).inputValue(), "660");
  await dialog.getByLabel("일정 제목", { exact: true }).fill("오후 2시 반 리허설");
  assert.equal(await dialog.getByLabel("시작시간", { exact: true }).inputValue(), "870");
  passed("date double-click opens a dated new event; title time inference and one-hour default work");
  await dialog.getByRole("checkbox", { name: "검증 사용자", exact: true }).waitFor();
  await dialog.getByRole("checkbox", { name: "검증 사용자", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "검증 동료", exact: true }).check();
  assert.equal(await dialog.locator('input[type="checkbox"]:checked').count(), 2);
  await dialog.getByRole("button", { name: "전체 선택", exact: true }).click();
  assert.equal(await dialog.locator('input[type="checkbox"]:checked').count(), 3);
  await dialog.getByRole("button", { name: "선택 해제", exact: true }).click();
  assert.equal(await dialog.locator('input[type="checkbox"]:checked').count(), 0);
  await dialog.getByRole("checkbox", { name: "검증 사용자", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "검증 동료", exact: true }).check();
  passed("participant multiple selection, select-all and clear-all are optional and functional");
  await dialog.getByLabel("일정 제목", { exact: true }).fill("검증 줌미팅");
  await dialog.getByLabel("회의 종류", { exact: true }).selectOption({ label: "강사 줌미팅" });
  await dialog.getByLabel("연결 강의", { exact: true }).selectOption(courseId);
  await dialog.getByLabel("시작시간", { exact: true }).selectOption("1260");
  await dialog.getByLabel("소요시간", { exact: true }).selectOption("90");
  await dialog.getByLabel("메모", { exact: true }).fill("강의 자료 확인");
  const savedResponse = page.waitForResponse((response) => response.url() === `${appOrigin}/api/shared-calendar` && response.request().method() === "POST");
  await dialog.getByRole("button", { name: "일정 등록", exact: true }).click();
  const saved = await savedResponse;
  assert.equal(saved.status(), 201, await saved.text());
  await page.getByRole("status").filter({ hasText: "일정을 저장" }).waitFor();
  const stored = await exclusive(async () => { await db.exec("reset role"); return (await db.query("select * from shared_calendar_events")).rows[0]; });
  if (stored.event_date instanceof Date) stored.event_date = stored.event_date.toISOString().slice(0, 10);
  assert.equal(stored.start_minutes, 1260); assert.equal(stored.duration_minutes, 90); assert.equal(stored.course_id, courseId);
  assert.deepEqual(stored.participant_ids, [users[0].id, users[1].id]);
  passed("normal user creates a Zoom meeting through the real API into RLS-protected SQL");
  await page.goto(`${appOrigin}/services/course-operations/${courseId}`);
  await page.getByRole("heading", { name: "공용캘린더 일정", exact: true }).waitFor();
  await page.getByText("검증 줌미팅", { exact: true }).waitFor();
  passed("linked course detail renders persisted calendar event at the bottom");
  await page.goto(`${appOrigin}/calendar`);
  const eventButton = page.getByRole("button", { name: "검증 줌미팅 수정", exact: true });
  await eventButton.click(); assert.equal(await page.getByRole("dialog").count(), 0);
  await eventButton.dblclick(); dialog = page.getByRole("dialog"); await dialog.waitFor();
  await dialog.getByRole("checkbox", { name: "검증 사용자", exact: true }).waitFor();
  assert.equal(await dialog.locator('input[type="checkbox"]:checked').count(), 2);
  await dialog.getByRole("button", { name: "공유", exact: true }).click();
  await dialog.getByRole("status").filter({ hasText: "공유 내용을 클립보드에 복사" }).waitFor();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(clipboard.includes("검증 줌미팅")); assert.ok(clipboard.includes("강의 자료 확인"));
  assert.ok(clipboard.includes("참여자: 검증 사용자, 검증 동료")); assert.ok(clipboard.includes("21:00~22:30"));
  passed("event single-click does not edit; double-click restores participants and share copies usable plain text");
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Clipboard denied fixture"); } } }); });
  await dialog.getByRole("button", { name: "공유", exact: true }).click();
  await dialog.getByLabel("공유 텍스트", { exact: true }).waitFor();
  assert.equal(await dialog.getByLabel("공유 텍스트", { exact: true }).inputValue(), clipboard.replaceAll("\r\n", "\n"));
  assert.equal(await dialog.getByLabel("공유 텍스트", { exact: true }).getAttribute("readonly"), "");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  passed("clipboard denial provides selectable manual-copy text without modifying the event");
  const targetCell = page.locator("[data-calendar-date]").nth(12);
  const movedDate = await targetCell.getAttribute("data-calendar-date");
  const movedResponse = page.waitForResponse((response) => response.url() === `${appOrigin}/api/shared-calendar/${stored.id}/move`);
  await eventButton.dragTo(targetCell);
  const moved = await movedResponse; assert.equal(moved.status(), 200, await moved.text());
  await page.getByRole("status").filter({ hasText: "일정 날짜를 변경했습니다" }).waitFor();
  const movedEvent = (await moved.json()).event;
  assert.equal(movedEvent.event_date, movedDate); assert.equal(movedEvent.start_minutes, 1260); assert.equal(movedEvent.duration_minutes, 90);
  assert.deepEqual(movedEvent.participant_ids, stored.participant_ids); assert.equal(movedEvent.title, stored.title);
  assert.equal(movedEvent.version, stored.version + 1);
  passed("native mouse drag changes only the date and preserves title, duration, course and participants");
  const staleMove = await context.request.patch(`${appOrigin}/api/shared-calendar/${stored.id}/move`, { data: { eventDate: createdDate, version: stored.version } });
  assert.equal(staleMove.status(), 409);
  const invalidMove = await context.request.patch(`${appOrigin}/api/shared-calendar/${stored.id}/move`, { data: { eventDate: "2026-02-30", version: movedEvent.version } });
  assert.equal(invalidMove.status(), 400);
  passed("stale moves and invalid dates are rejected instead of overwriting shared changes");
  const colleague = await login(users[1]); await colleague.page.goto(`${appOrigin}/calendar`);
  await colleague.page.getByRole("button", { name: "검증 줌미팅 수정", exact: true }).dblclick();
  dialog = colleague.page.getByRole("dialog");
  await dialog.getByLabel("일정 제목", { exact: true }).fill("동료가 수정한 미팅");
  await dialog.getByRole("button", { name: "변경 저장", exact: true }).click();
  await colleague.page.getByRole("status").filter({ hasText: "일정을 저장" }).waitFor();
  passed("another workspace member can edit shared schedules");
  const latestResponse = await context.request.get(`${appOrigin}/api/shared-calendar?from=${movedDate}&to=${movedDate}`);
  const latestEvent = (await latestResponse.json()).events.find((event) => event.id === stored.id);
  const oldClient = await context.request.patch(`${appOrigin}/api/shared-calendar/${stored.id}`, { data: { title: latestEvent.title, eventDate: latestEvent.event_date, startMinutes: latestEvent.start_minutes, durationMinutes: latestEvent.duration_minutes, meetingTypeId: latestEvent.meeting_type_id, courseId, notes: latestEvent.notes, version: latestEvent.version } });
  assert.equal(oldClient.status(), 200); assert.deepEqual((await oldClient.json()).event.participant_ids, stored.participant_ids);
  passed("older open clients that omit participants preserve the current selection");
  const conflict = await context.request.patch(`${appOrigin}/api/shared-calendar/${stored.id}`, { data: { title: "오래된 수정", eventDate: stored.event_date, startMinutes: 540, durationMinutes: 60, meetingTypeId: stored.meeting_type_id, courseId, notes: "", version: stored.version } });
  assert.equal(conflict.status(), 409, await conflict.text());
  passed("stale version gets 409 instead of overwriting a colleague’s change");
  assert.equal((await context.request.post(`${appOrigin}/api/admin/calendar-meeting-types`, { data: { name: "일반 사용자 종류" } })).status(), 403);
  const denied = await context.request.get(`${appOrigin}/admin/calendar`); assert.equal(denied.status(), 404);
  passed("normal users cannot open admin section or add meeting types");
  const admin = await login(users[2]); await admin.page.goto(`${appOrigin}/admin`);
  await admin.page.getByRole("heading", { name: "회의 항목 추가", exact: true }).waitFor();
  await admin.page.getByLabel("회의 항목 이름", { exact: true }).fill("월간 기획회의");
  await admin.page.getByRole("button", { name: "항목 추가", exact: true }).click();
  await admin.page.getByRole("status").filter({ hasText: "회의 항목을 추가" }).waitFor();
  assert.equal((await admin.context.request.post(`${appOrigin}/api/admin/calendar-meeting-types`, { data: { name: "월간 기획회의" } })).status(), 409);
  passed("admin section adds a custom meeting type and rejects duplicates");
  await page.reload();
  await page.getByRole("button", { name: "일정 등록", exact: true }).click();
  dialog = page.getByRole("dialog"); await dialog.getByLabel("회의 종류", { exact: true }).selectOption({ label: "월간 기획회의" });
  assert.equal(await dialog.getByLabel("연결 강의", { exact: true }).count(), 0);
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  passed("new meeting type is shared; course linking is limited to instructor Zoom");
  const invalid = { title: "시간 검증", eventDate: stored.event_date, startMinutes: 1290, durationMinutes: 60, meetingTypeId: stored.meeting_type_id, courseId: null, notes: "" };
  assert.equal((await context.request.post(`${appOrigin}/api/shared-calendar`, { data: invalid })).status(), 400);
  assert.equal((await context.request.post(`${appOrigin}/api/shared-calendar`, { headers: { Origin: "https://attacker.invalid" }, data: { ...invalid, startMinutes: 480 } })).status(), 403);
  passed("server rejects out-of-range times and cross-origin writes");
  assert.equal((await context.request.post(`${appOrigin}/api/shared-calendar`, { data: { ...invalid, startMinutes: 480, participantIds: ["00000000-0000-4000-8000-000000000099"] } })).status(), 400);
  passed("real API and private DB trigger reject participants outside the workspace");
  await page.getByRole("button", { name: "동료가 수정한 미팅 수정", exact: true }).dblclick();
  dialog = page.getByRole("dialog"); await dialog.getByRole("button", { name: "일정 삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "일정을 삭제" }).waitFor();
  assert.equal((await exclusive(async () => { await db.exec("reset role"); return await db.query("select * from shared_calendar_events"); })).rows.length, 0);
  passed("confirmed deletion removes persisted event for all users");
  const keyboardDate = page.locator("[data-calendar-date]").nth(10).getByRole("button");
  await keyboardDate.focus(); await keyboardDate.press("Enter");
  await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
  passed("keyboard Enter can create an event without requiring mouse double-click");
  // An empty cell (not only its date button) also supports double-click creation.
  await page.locator("[data-calendar-date]").nth(10).dblclick({ position: { x: 35, y: 55 } });
  dialog = page.getByRole("dialog"); await dialog.waitFor();
  await dialog.getByLabel("일정 제목", { exact: true }).fill("11시 참여자 없는 미팅");
  await dialog.getByRole("button", { name: "일정 등록", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "일정을 저장" }).waitFor();
  const noPeople = (await context.request.get(`${appOrigin}/api/shared-calendar?from=${createdDate}&to=${createdDate}`));
  const noPeopleEvent = (await noPeople.json()).events[0];
  assert.deepEqual(noPeopleEvent.participant_ids, []); assert.equal(noPeopleEvent.start_minutes, 660); assert.equal(noPeopleEvent.duration_minutes, 60);
  passed("double-clicking empty date space creates and persists a one-hour event without participants");
  await context.request.delete(`${appOrigin}/api/shared-calendar/${noPeopleEvent.id}`, { data: { version: noPeopleEvent.version } });
  await page.reload();
  participantOutage = true;
  await page.getByRole("button", { name: "일정 등록", exact: true }).click();
  dialog = page.getByRole("dialog"); await dialog.getByRole("alert").filter({ hasText: "참여자 목록을 불러오지 못했습니다" }).waitFor();
  await dialog.getByLabel("일정 제목", { exact: true }).fill("디렉터리 장애 중 미팅");
  await dialog.getByRole("button", { name: "일정 등록", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "일정을 저장" }).waitFor();
  participantOutage = false;
  passed("participant directory failure does not block creating an optional-participant event");
  outage = true; await page.getByRole("button", { name: "일정 새로고침", exact: true }).click();
  const loadAlert = page.getByRole("alert").filter({ hasText: "일정을 처리하지 못했습니다" });
  await loadAlert.waitFor(); outage = false;
  await page.getByRole("button", { name: "일정 새로고침", exact: true }).click();
  await loadAlert.waitFor({ state: "hidden" });
  passed("calendar load failure is visible and retry recovers");
  await page.getByRole("button", { name: "다음 달", exact: true }).click();
  await page.getByRole("button", { name: "일정 등록", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "오늘", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "mobile calendar must not cause horizontal overflow");
  passed("month navigation and mobile layout work without horizontal overflow");
  console.log(`Shared calendar browser/API/SQL checks: ${checks} passed.`);
} catch (error) { console.error(appOutput); throw error; }
finally { await browser?.close(); app.kill(); await new Promise((resolve) => fixture.close(resolve)); await db.close(); }
