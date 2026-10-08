import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const W1 = id(1), W2 = id(2), U1 = id(11), U2 = id(12), ADMIN = id(13);

test("장소·시간 미정·일괄 입력은 DB 제약, RLS, 원자성 및 재시도 중복 방지를 지킨다", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}', banned_until timestamptz, email_confirmed_at timestamptz default now());
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid, user_id uuid, role text);
      create table public.courses(id uuid primary key, workspace_id uuid);
      grant usage on schema auth to anon, authenticated; grant select on public.courses to authenticated;
      insert into auth.users(id,email) values ('${U1}','u1@example.invalid'),('${U2}','u2@example.invalid'),('${ADMIN}','admin@example.invalid');
      insert into workspaces values ('${W1}'),('${W2}');
      insert into workspace_members values ('${W1}','${U1}','user'),('${W1}','${U2}','user'),('${W1}','${ADMIN}','admin');`);
    for (const file of ["20261008090358_shared_calendar", "20261008100344_shared_calendar_participants", "20261008102522_shared_calendar_location_bulk_import"]) await db.exec(await readFile(`supabase/migrations/${file}.sql`, "utf8"));
    const zoom = (await db.query<{ id: string }>("select id from shared_calendar_meeting_types where workspace_id=$1 and code='instructor_zoom'", [W1])).rows[0].id;
    const draft = { title: "줌 미팅 · 강사", eventDate: "2026-10-12", startMinutes: 660, durationMinutes: 60, meetingTypeId: zoom, courseId: null, notes: "자료 확인", participantIds: [U1, U2], locationKind: "online", locationText: "", timeTbd: false };
    const assume = (user: string) => db.exec(`reset role; set request.jwt.claim.sub='${user}'; set role authenticated;`);
    const run = async (requestId: string, events: unknown, create = false, workspace = W1) => (await db.query<{ result: { eventIds: string[]; alreadyImported: boolean } }>("select public.shared_calendar_import($1,$2,$3::jsonb,$4) as result", [workspace, requestId, JSON.stringify(events), create])).rows[0].result;
    await assume(U1);
    let first: { eventIds: string[]; alreadyImported: boolean };
    await t.test("구성원은 기존 종류로 여러 일정을 추가하며 장소·시간 미정을 보존한다", async () => {
      first = await run(id(31), [draft, { ...draft, title: "미정 촬영", locationKind: "custom", locationText: "오산", timeTbd: true }]);
      assert.equal(first.alreadyImported, false); assert.equal(first.eventIds.length, 2);
      const rows = (await db.query<{ title: string; location_text: string; time_tbd: boolean }>("select title,location_text,time_tbd from shared_calendar_events order by title")).rows;
      assert.equal(rows.length, 2); assert.ok(rows.some((row) => row.location_text === "오산" && row.time_tbd));
    });
    await t.test("동일 요청 재시도는 같은 ID를 반환하며 내용을 바꾸면 충돌로 거부한다", async () => {
      const replay = await run(id(31), [draft, { ...draft, title: "미정 촬영", locationKind: "custom", locationText: "오산", timeTbd: true }]);
      assert.equal(replay.alreadyImported, true); assert.deepEqual(replay.eventIds, first!.eventIds);
      await assert.rejects(() => run(id(31), [draft]), { code: "40001" });
      assert.equal((await db.query("select * from shared_calendar_events")).rows.length, 2);
    });
    await t.test("장소·행 수·참여자 제약 위반은 앞선 유효 행까지 전부 롤백한다", async () => {
      for (const patch of [{ locationKind: "custom", locationText: "" }, { locationKind: "online", locationText: "오산" }, { locationKind: "office" }, { participantIds: [id(99)] }, { startMinutes: 1290 }]) await assert.rejects(() => run(id(32), [draft, { ...draft, ...patch }]), { code: "23514" });
      for (const events of [[], {}, null, Array(101).fill(draft)]) await assert.rejects(() => run(id(32), events), { code: "23514" });
      assert.equal((await db.query("select * from shared_calendar_events")).rows.length, 2);
      assert.equal((await db.query("select * from shared_calendar_imports")).rows.length, 1);
    });
    await t.test("일반 구성원은 새 종류 생성과 다른 워크스페이스 가져오기를 할 수 없다", async () => {
      await assert.rejects(() => run(id(33), [{ ...draft, meetingTypeId: null, newMeetingTypeName: "릴스 촬영" }], true), { code: "42501" });
      await assert.rejects(() => run(id(33), [draft], false, W2), { code: "42501" });
      await assume(U2); assert.equal((await db.query("select * from shared_calendar_imports")).rows.length, 0);
    });
    await t.test("관리자 신규 종류도 행 실패 시 롤백되고 정상 요청에서는 한 번만 생성된다", async () => {
      await assume(ADMIN);
      const custom = { ...draft, meetingTypeId: null, newMeetingTypeName: "릴스 촬영", locationKind: "custom", locationText: "수서" };
      await assert.rejects(() => run(id(34), [custom, { ...custom, participantIds: [id(99)] }], true), { code: "23514" });
      assert.equal((await db.query("select * from shared_calendar_meeting_types where name='릴스 촬영'")).rows.length, 0);
      assert.equal((await db.query("select * from shared_calendar_imports")).rows.length, 0);
      const created = await run(id(34), [custom, custom], true);
      assert.equal(created.eventIds.length, 2);
      assert.equal((await db.query("select * from shared_calendar_meeting_types where name='릴스 촬영'")).rows.length, 1);
    });
    await t.test("직접 UPDATE도 장소 제약을 지키며 RPC는 invoker·익명 실행 금지 상태다", async () => {
      await assert.rejects(() => db.exec("update shared_calendar_events set location_kind='custom',location_text=''"), { code: "23514" });
      const meta = (await db.query<{ prosecdef: boolean; anon_exec: boolean }>("select prosecdef,has_function_privilege('anon',oid,'EXECUTE') as anon_exec from pg_proc where oid='public.shared_calendar_import(uuid,uuid,jsonb,boolean)'::regprocedure")).rows[0];
      assert.equal(meta.prosecdef, false); assert.equal(meta.anon_exec, false);
      await db.exec("reset role; set role anon"); await assert.rejects(() => run(id(35), [draft]), { code: "42501" });
    });
  } finally { await db.close(); }
});
