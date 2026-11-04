import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("광고집행비는 엠리치컴퍼니 담당자로 장부에 한 번만 기록하고 최신 값으로 갱신한다", async () => {
  const db = new PGlite();
  const actor = "00000000-0000-4000-8000-000000000001";
  const workspace = "00000000-0000-4000-8000-000000000002";
  const course = "00000000-0000-4000-8000-000000000003";
  const cost = "00000000-0000-4000-8000-000000000004";
  try {
    await db.exec(`
      create role service_role; create role anon; create role authenticated;
      create table public.courses (id uuid primary key, workspace_id uuid not null, name text not null);
      create table public.workspace_members (workspace_id uuid not null, user_id uuid not null);
      create table public.course_costs (id uuid primary key, course_id uuid not null, category_code text not null, name text not null, gross_amount bigint not null, paid_date date, deleted_at timestamptz);
      create table public.cash_ledger_settings (workspace_id uuid primary key, start_date date not null);
      create table public.cash_ledger_parties (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, name text not null, note text not null default '', source_key text, constraint cash_ledger_parties_workspace_source_key_key unique (workspace_id, source_key));
      create table public.cash_ledger_entries (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, kind text not null, title text not null, party_id uuid not null, course_id uuid, amount bigint not null, entry_date date not null, note text not null);
      insert into public.courses values ('${course}', '${workspace}', '광고 강의');
      insert into public.workspace_members values ('${workspace}', '${actor}');
      insert into public.cash_ledger_settings values ('${workspace}', '2026-11-01');
      insert into public.course_costs values ('${cost}', '${course}', 'AD_OPERATION', '메타 광고', 120000, '2026-10-25', null);
    `);
    await db.exec(await readFile("supabase/migrations/20261104082457_link_ad_operation_costs_to_cash_ledger.sql", "utf8"));
    const record = () => db.query<{ record_course_ad_operation_ledger_expense: string }>(
      "select public.record_course_ad_operation_ledger_expense($1, $2, $3)", [course, cost, actor],
    );
    const first = (await record()).rows[0].record_course_ad_operation_ledger_expense;
    const entry = (await db.query<{ amount: number; entry_date: string; party_name: string }>(`
      select entry.amount, entry.entry_date::text, party.name as party_name
      from public.cash_ledger_entries as entry join public.cash_ledger_parties as party on party.id = entry.party_id
      where entry.id = $1
    `, [first])).rows[0];
    assert.deepEqual(entry, { amount: 120000, entry_date: "2026-11-01", party_name: "엠리치컴퍼니" });
    await db.query("update public.course_costs set gross_amount=250000, paid_date='2026-11-04' where id=$1", [cost]);
    const second = (await record()).rows[0].record_course_ad_operation_ledger_expense;
    assert.equal(second, first);
    assert.deepEqual((await db.query<{ count: number; amount: number; entry_date: string }>(`
      select count(*)::int as count, max(amount)::int as amount, max(entry_date)::text as entry_date from public.cash_ledger_entries
    `)).rows[0], { count: 1, amount: 250000, entry_date: "2026-11-04" });
    await db.query("update public.course_costs set category_code='TEXTBOOK' where id=$1", [cost]);
    await assert.rejects(record(), /광고집행비만/);
  } finally {
    await db.close();
  }
});
