import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
const W1 = "00000000-0000-4000-8000-000000000001", W2 = "00000000-0000-4000-8000-000000000002";
const U1 = "00000000-0000-4000-8000-000000000011", U2 = "00000000-0000-4000-8000-000000000012";
const P1 = "00000000-0000-4000-8000-000000000021", P2 = "00000000-0000-4000-8000-000000000022", C1 = "00000000-0000-4000-8000-000000000031", C2 = "00000000-0000-4000-8000-000000000032";
const S1 = "00000000-0000-4000-8000-000000000041";
const T1 = "00000000-0000-4000-8000-000000000051";
test("입출금 장부 마이그레이션과 실제 DB 권한·잔고 기준·연결 무결성", async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table auth.users(id uuid primary key, email text, raw_app_meta_data jsonb default '{}', banned_until timestamptz);
      create table public.workspaces(id uuid primary key); create table public.workspace_members(workspace_id uuid,user_id uuid,role text);
      create table public.courses(id uuid primary key, workspace_id uuid, instructor_name text);
      create table public.course_settlement_projects(id uuid primary key, workspace_id uuid not null, course_id uuid not null, status text not null, updated_at timestamptz not null default now());
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      grant usage on schema auth to authenticated; grant select on public.courses to authenticated; grant all on public.courses, public.course_settlement_projects to service_role;
      insert into auth.users(id,email) values ('${U1}','one@example.test'),('${U2}','two@example.test');
      insert into workspaces values ('${W1}'),('${W2}'); insert into workspace_members values ('${W1}','${U1}','user'),('${W2}','${U2}','user');
      insert into courses values ('${C1}','${W1}','김강사'),('${C2}','${W2}','다른강사');`);
    await db.exec(await readFile("supabase/migrations/20261008090358_shared_calendar.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261015063730_cash_ledger.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261025140632_supply_requests.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261102063744_add_supply_request_purchase_url.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261102141241_link_completed_supplies_to_cash_ledger.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261102234541_link_confirmed_settlements_to_cash_ledger.sql", "utf8"));
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
    await t.test("비품 구매완료 비용을 한 번만 등록하고 구매완료 취소 시 제거한다", async () => {
      await db.exec("reset role; set role service_role");
      await db.query(
        `insert into supply_requests
          (id, workspace_id, requester_id, requester_name, item_name, price_krw, purpose, approval_status, reviewed_at)
         values ($1, $2, $3, '권정인', '촬영용 삼각대', 120000, '강의 촬영', 'approved', now())`,
        [S1, W1, U1],
      );
      await db.query(
        "update supply_requests set purchased=true, purchased_by=$1, purchased_at='2026-11-02T12:00:00+09:00', version=version+1 where id=$2",
        [U1, S1],
      );

      const expense = await db.query<{ kind: string; title: string; amount: number; entry_date: Date; source_key: string }>(`
        select entry.kind, entry.title, entry.amount, entry.entry_date, party.source_key
        from cash_ledger_entries entry
        join cash_ledger_parties party on party.id = entry.party_id
        where entry.supply_request_id = '${S1}'
      `);
      assert.equal(expense.rows[0].kind, "expense");
      assert.equal(expense.rows[0].title, "비품 구매 - 촬영용 삼각대");
      assert.equal(Number(expense.rows[0].amount), 120000);
      assert.equal(expense.rows[0].entry_date.toISOString().slice(0, 10), "2026-11-02");
      assert.equal(expense.rows[0].source_key, "supply_requests");

      await db.exec(`update supply_requests set note='영수증 확인' where id='${S1}'`);
      assert.equal((await db.query(`select id from cash_ledger_entries where supply_request_id='${S1}'`)).rows.length, 1);

      await db.exec(`update supply_requests set purchased=false, purchased_by=null, purchased_at=null, version=version+1 where id='${S1}'`);
      assert.equal((await db.query(`select id from cash_ledger_entries where supply_request_id='${S1}'`)).rows.length, 0);
      await db.exec(`delete from supply_requests where id='${S1}'; reset role`);
      await assume(U1);
    });
    await t.test("정산 확정 강사 지급액을 한 번만 비용으로 등록하고 확정 취소 시 제거한다", async () => {
      await db.exec("reset role; set role service_role");
      await db.exec(`insert into course_settlement_projects(id,workspace_id,course_id,status,updated_at) values ('${T1}','${W1}','${C1}','비용입력중','2026-11-03T12:00:00+09:00');
        update course_settlement_projects set status='정산확정', instructor_payout_amount=330000, updated_at='2026-11-03T12:00:00+09:00' where id='${T1}';`);
      const expense = await db.query<{ title: string; amount: number; course_id: string; note: string; name: string }>(`
        select entry.title, entry.amount, entry.course_id, entry.note, party.name
        from cash_ledger_entries entry join cash_ledger_parties party on party.id=entry.party_id
        where entry.course_settlement_id='${T1}'
      `);
      assert.deepEqual(expense.rows[0], { title: "강의료 지급-김강사", amount: 330000, course_id: C1, note: "강사 지급액 정산 자동 등록", name: "김강사" });
      await db.exec(`update course_settlement_projects set instructor_payout_amount=350000 where id='${T1}'`);
      assert.equal((await db.query(`select id from cash_ledger_entries where course_settlement_id='${T1}'`)).rows.length, 1);
      assert.equal(Number((await db.query<{ amount: number }>(`select amount from cash_ledger_entries where course_settlement_id='${T1}'`)).rows[0].amount), 350000);
      await db.exec(`update course_settlement_projects set status='비용입력중', instructor_payout_amount=0 where id='${T1}'; delete from course_settlement_projects where id='${T1}'; reset role`);
      await assume(U1);
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
