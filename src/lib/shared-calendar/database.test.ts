import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const W1 = "00000000-0000-4000-8000-000000000001";
const W2 = "00000000-0000-4000-8000-000000000002";
const U1 = "00000000-0000-4000-8000-000000000011";
const U2 = "00000000-0000-4000-8000-000000000012";
const ADMIN = "00000000-0000-4000-8000-000000000013";
const C1 = "00000000-0000-4000-8000-000000000021";
const C2 = "00000000-0000-4000-8000-000000000022";

test("공용캘린더 마이그레이션: CRUD, 시간/강의 제약, 워크스페이스·관리자·비활성 계정 RLS", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}', banned_until timestamptz, email_confirmed_at timestamptz default now());
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid, user_id uuid, role text);
      create table public.courses(id uuid primary key, workspace_id uuid);
      grant usage on schema auth to anon, authenticated;
      grant select on public.courses to authenticated;
      insert into auth.users(id, email) values ('${U1}', 'user1@example.invalid'), ('${U2}', 'user2@example.invalid'), ('${ADMIN}', 'admin@example.invalid');
      insert into workspaces values ('${W1}'), ('${W2}');
      insert into workspace_members values ('${W1}', '${U1}', 'user'), ('${W1}', '${U2}', 'user'), ('${W1}', '${ADMIN}', 'admin');
      insert into courses values ('${C1}', '${W1}'), ('${C2}', '${W2}');
    `);
    await db.exec(await readFile("supabase/migrations/20261008090358_shared_calendar.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261008100344_shared_calendar_participants.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261008102522_shared_calendar_location_bulk_import.sql", "utf8"));
    const types = (await db.query<{ id: string; code: string; workspace_id: string }>("select id, code, workspace_id from shared_calendar_meeting_types")).rows;
    const zoom = types.find((type) => type.workspace_id === W1 && type.code === "instructor_zoom")!.id;
    const weekly = types.find((type) => type.workspace_id === W1 && type.code === "weekly_meeting")!.id;
    const otherZoom = types.find((type) => type.workspace_id === W2 && type.code === "instructor_zoom")!.id;
    const assume = (user: string) => db.exec(`reset role; set request.jwt.claim.sub = '${user}'; set role authenticated;`);
    const insert = (changes = "") => db.exec(`insert into shared_calendar_events(workspace_id, title, event_date, start_minutes, duration_minutes, meeting_type_id ${changes ? ",course_id" : ""}) values ('${W1}', '미팅', '2026-10-08', 480, 90, '${zoom}' ${changes ? `, '${changes}'` : ""});`);
    await t.test("기본 4종류를 워크스페이스마다 생성하고 익명 접근을 금지한다", async () => {
      assert.equal(types.length, 8);
      await db.exec("set role anon");
      await assert.rejects(() => db.query("select * from shared_calendar_events"), /permission denied/u);
      await db.exec("reset role");
    });
    await t.test("일반 사용자는 같은 워크스페이스의 종류와 일정을 읽고 추가한다", async () => {
      await assume(U1);
      assert.equal((await db.query("select * from shared_calendar_meeting_types")).rows.length, 4);
      await insert(C1);
      await assert.rejects(() => db.exec(`insert into shared_calendar_events(workspace_id,title,event_date,start_minutes,duration_minutes,meeting_type_id) values ('${W2}', '침범', '2026-10-08', 480, 30, '${otherZoom}')`), { code: "42501" });
    });
    await t.test("다른 구성원도 편집하고 버전이 증가하며 충돌 요청은 갱신하지 않는다", async () => {
      await assume(U2);
      await db.exec("update shared_calendar_events set title='변경된 미팅' where version=1");
      const row = (await db.query<{ title: string; version: number; created_by: string }>("select title, version, created_by from shared_calendar_events")).rows[0];
      assert.equal(row.version, 2); assert.equal(row.created_by, U1);
      await db.exec("update shared_calendar_events set title='충돌' where version=1");
      assert.equal((await db.query<{ title: string }>("select title from shared_calendar_events")).rows[0].title, "변경된 미팅");
      await assert.rejects(() => db.exec(`update shared_calendar_events set created_by='${U2}'`), /permission denied/u);
    });
    await t.test("참여자는 기본 빈 선택이며 복수 선택과 날짜 이동에 원자적으로 보존된다", async () => {
      assert.deepEqual((await db.query<{ participant_ids: string[] }>("select participant_ids from shared_calendar_events")).rows[0].participant_ids, []);
      await db.exec(`update shared_calendar_events set participant_ids=array['${U1}', '${U2}']::uuid[]`);
      const before = (await db.query<{ version: number; start_minutes: number; duration_minutes: number }>("select * from shared_calendar_events")).rows[0];
      await db.exec(`update shared_calendar_events set event_date='2026-10-09' where version=${before.version}`);
      const after = (await db.query<{ version: number; participant_ids: string[]; start_minutes: number; duration_minutes: number }>("select * from shared_calendar_events")).rows[0];
      assert.equal(after.version, before.version + 1); assert.deepEqual(after.participant_ids, [U1, U2]);
      assert.equal(after.start_minutes, before.start_minutes); assert.equal(after.duration_minutes, before.duration_minutes);
    });
    await t.test("DB에서도 중복·NULL·2차원·다른 워크스페이스·비활성·미인증 참여자를 차단한다", async () => {
      const outsider = "00000000-0000-4000-8000-000000000099";
      await db.exec(`reset role; insert into auth.users(id,email,email_confirmed_at) values ('${outsider}', 'outsider@example.invalid', now()); insert into workspace_members values ('${W2}', '${outsider}', 'user')`);
      await assume(U2);
      for (const value of [`array['${U1}', '${U1}']::uuid[]`, "array[null]::uuid[]", `array[['${U1}'],['${U2}']]::uuid[]`, `array['${outsider}']::uuid[]`]) await assert.rejects(() => db.exec(`update shared_calendar_events set participant_ids=${value}`), /Participants|participants/u);
      await db.exec(`update shared_calendar_events set participant_ids='{}'::uuid[]`);
      await db.exec(`reset role; update auth.users set raw_app_meta_data='{"account_disabled":true}' where id='${U1}'`);
      await assume(U2);
      await assert.rejects(() => db.exec(`update shared_calendar_events set participant_ids=array['${U1}']::uuid[]`), /active members/u);
      await db.exec(`reset role; update auth.users set raw_app_meta_data='{}', email_confirmed_at=null where id='${U1}'`);
      await assume(U2);
      await assert.rejects(() => db.exec(`update shared_calendar_events set participant_ids=array['${U1}']::uuid[]`), /active members/u);
      await db.exec(`reset role; update auth.users set email_confirmed_at=now() where id='${U1}'`);
      await assume(U2); await db.exec(`update shared_calendar_events set participant_ids=array['${U1}']::uuid[]`);
      await db.exec(`reset role; update auth.users set raw_app_meta_data='{"account_disabled":true}' where id='${U1}'`);
      await assume(U2);
      await db.exec(`update shared_calendar_events set title='기존 비활성 참여자 보존', participant_ids=array['${U1}']::uuid[]`);
      await db.exec(`reset role; update auth.users set raw_app_meta_data='{}' where id='${U1}'`);
      await assume(U2);
      await assert.rejects(() => db.query("select calendar_private.guard_participants()"), /permission denied/u);
    });
    await t.test("DB에서도 시작시간/소요시간 30분 단위와 범위를 강제한다", async () => {
      for (const sql of ["start_minutes=450", "start_minutes=1290", "start_minutes=481", "duration_minutes=45", "duration_minutes=0", "duration_minutes=1470"]) await assert.rejects(() => db.exec(`update shared_calendar_events set ${sql}`), /check constraint/u);
      await db.exec("update shared_calendar_events set start_minutes=1260, duration_minutes=240");
    });
    await t.test("종류/강의의 다른 워크스페이스 연결과 줌미팅 이외 강의 연결을 차단한다", async () => {
      await assert.rejects(() => db.exec(`update shared_calendar_events set course_id='${C2}'`), /same workspace/u);
      await assert.rejects(() => db.exec(`update shared_calendar_events set meeting_type_id='${weekly}'`), /Only instructor/u);
      await assert.rejects(() => db.exec(`update shared_calendar_events set meeting_type_id='${otherZoom}', course_id=null`), /foreign key/u);
    });
    await t.test("일반 사용자 추가를 차단하고 관리자만 사용자 정의 회의 종류를 추가한다", async () => {
      await assert.rejects(() => db.exec(`insert into shared_calendar_meeting_types(workspace_id,name) values ('${W1}', '워크숍')`), /row-level security/u);
      await assume(ADMIN);
      await db.exec(`insert into shared_calendar_meeting_types(workspace_id,name) values ('${W1}', '워크숍')`);
      await assert.rejects(() => db.exec(`insert into shared_calendar_meeting_types(workspace_id,name) values ('${W1}', '워크숍')`), /unique constraint/u);
      await assert.rejects(() => db.exec(`insert into shared_calendar_meeting_types(workspace_id,name,code) values ('${W1}', '가짜 줌', 'instructor_zoom')`), /row-level security/u);
    });
    await t.test("비활성 계정은 기존 JWT가 있어도 DB 접근과 변경이 차단된다", async () => {
      await db.exec(`reset role; update auth.users set raw_app_meta_data='{"account_disabled":true}' where id='${U2}'`);
      await assume(U2);
      assert.equal((await db.query("select * from shared_calendar_events")).rows.length, 0);
      await assert.rejects(() => insert(), { code: "42501" });
      await db.exec(`reset role; update auth.users set raw_app_meta_data='{}', banned_until=now()+interval '1 hour' where id='${U2}'`);
      await assume(U2);
      assert.equal((await db.query("select * from shared_calendar_events")).rows.length, 0);
    });
    await t.test("강의 삭제 시 일정은 보존하고 연결만 해제하며 작성자 삭제도 가능하다", async () => {
      await db.exec(`reset role; delete from courses where id='${C1}'; delete from auth.users where id='${U1}'`);
      const row = (await db.query<{ course_id: string | null; created_by: string | null }>("select course_id, created_by from shared_calendar_events")).rows[0];
      assert.equal(row.course_id, null); assert.equal(row.created_by, null);
    });
    await t.test("관리자는 공유 일정을 삭제할 수 있다", async () => {
      await assume(ADMIN); await db.exec("delete from shared_calendar_events");
      assert.equal((await db.query("select * from shared_calendar_events")).rows.length, 0);
    });
  } finally { await db.close(); }
});
