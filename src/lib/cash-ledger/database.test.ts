import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
const W1 = "00000000-0000-4000-8000-000000000001", W2 = "00000000-0000-4000-8000-000000000002";
const U1 = "00000000-0000-4000-8000-000000000011", U2 = "00000000-0000-4000-8000-000000000012";
const P1 = "00000000-0000-4000-8000-000000000021", P2 = "00000000-0000-4000-8000-000000000022", C2 = "00000000-0000-4000-8000-000000000032";
test("입출금 장부 마이그레이션과 실제 DB 권한·잔고 기준·연결 무결성", async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}', banned_until timestamptz);
      create table public.workspaces(id uuid primary key); create table public.workspace_members(workspace_id uuid,user_id uuid,role text);
      create table public.courses(id uuid primary key, workspace_id uuid);
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      grant usage on schema auth to authenticated; grant select on public.courses to authenticated;
      insert into auth.users(id,email) values ('${U1}','one@example.test'),('${U2}','two@example.test');
      insert into workspaces values ('${W1}'),('${W2}'); insert into workspace_members values ('${W1}','${U1}','user'),('${W2}','${U2}','user');
      insert into courses values ('${C2}','${W2}');`);
    await db.exec(await readFile("supabase/migrations/20261008090358_shared_calendar.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261015063730_cash_ledger.sql", "utf8"));
    const assume = (user: string) => db.exec(`reset role; set request.jwt.claim.sub='${user}'; set role authenticated;`);
    await assume(U2);
    await db.exec(`insert into cash_ledger_settings(workspace_id,start_date,opening_balance) values ('${W2}','2026-10-01',0); insert into cash_ledger_parties(id,workspace_id,name) values ('${P2}','${W2}','다른 거래처');`);
    await assume(U1);
    await t.test("멤버가 시작 잔고와 계좌 정보를 저장하고 수정한다", async () => {
      await db.exec(`insert into cash_ledger_settings(workspace_id,start_date,opening_balance) values ('${W1}','2026-10-15',1000000);
        insert into cash_ledger_parties(id,workspace_id,name,bank_name,account_number) values ('${P1}','${W1}','거래처','은행','123-456');
        update cash_ledger_parties set account_number='123-789' where id='${P1}';`);
      assert.equal((await db.query<{ version: number }>("select version from cash_ledger_parties")).rows[0].version, 2);
      assert.equal((await db.query("select * from cash_ledger_settings")).rows.length, 1);
    });
    await t.test("강의 없이 입출금 저장, 음수 금액과 시작일 이전 거래 차단", async () => {
      await db.exec(`insert into cash_ledger_entries(workspace_id,kind,title,party_id,amount,entry_date) values ('${W1}','income','입금','${P1}',200000,'2026-10-15'), ('${W1}','expense','지출','${P1}',30000,'2026-10-16');`);
      await assert.rejects(() => db.exec("update cash_ledger_entries set amount=-1"), /check constraint/);
      await assert.rejects(() => db.exec("update cash_ledger_entries set entry_date='2026-10-14'"), /predates/);
      await assert.rejects(() => db.exec("update cash_ledger_settings set start_date='2026-10-16'"), /excludes/);
      const result = await db.query<{ balance: string }>("select (select opening_balance from cash_ledger_settings) + sum(case when kind='income' then amount else -amount end) as balance from cash_ledger_entries");
      assert.equal(String(result.rows[0].balance), "1170000");
    });
    await t.test("다른 워크스페이스 강의·거래처 연결, 번호 변경, 원시 첨부 생성 차단", async () => {
      await assert.rejects(() => db.exec(`update cash_ledger_entries set course_id='${C2}'`), /same workspace/);
      await assert.rejects(() => db.exec(`update cash_ledger_entries set party_id='${P2}'`), /foreign key/);
      await assert.rejects(() => db.exec("update cash_ledger_entries set entry_number=999"), /permission denied|only be updated to DEFAULT/);
      await assert.rejects(() => db.exec(`insert into cash_ledger_attachments(workspace_id,entry_id,storage_path,original_name,mime_type,file_size) select workspace_id,id,'fake','fake.png','image/png',10 from cash_ledger_entries limit 1`), /permission denied/);
    });
    await t.test("수정 버전으로 동시 덮어쓰기·삭제를 예방한다", async () => {
      const first = (await db.query<{ id: string; version: number }>("select id,version from cash_ledger_entries where kind='income'")).rows[0];
      await db.exec(`update cash_ledger_entries set amount=300000 where id='${first.id}' and version=${first.version}`);
      assert.equal((await db.query(`update cash_ledger_entries set amount=1 where id='${first.id}' and version=${first.version} returning id`)).rows.length, 0);
      assert.equal((await db.query(`delete from cash_ledger_entries where id='${first.id}' and version=${first.version} returning id`)).rows.length, 0);
      await db.exec(`delete from cash_ledger_entries where id='${first.id}' and version=${first.version + 1}`);
      assert.equal((await db.query("select * from cash_ledger_entries")).rows.length, 1);
    });
    await t.test("다른 멤버와 익명·비활성 계정의 장부 접근을 차단한다", async () => {
      await assume(U2); assert.equal((await db.query("select * from cash_ledger_entries")).rows.length, 0);
      await db.exec(`reset role; update auth.users set raw_app_meta_data='{"account_disabled":true}' where id='${U1}'`);
      await assume(U1); assert.equal((await db.query("select * from cash_ledger_parties")).rows.length, 0);
      await db.exec("reset role; set role anon"); await assert.rejects(() => db.query("select * from cash_ledger_entries"), /permission denied/);
      await db.exec("reset role"); assert.equal((await db.query<{ public: boolean }>("select public from storage.buckets where id='cash-ledger-evidence'")).rows[0].public, false);
    });
  } finally { await db.close(); }
});
