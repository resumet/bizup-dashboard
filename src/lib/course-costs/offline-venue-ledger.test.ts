import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("오프라인 장소 이용료는 공동 부담 비용에서도 입출금 장부에 한 번만 기록하고 갱신한다", async () => {
  const db = new PGlite();
  const actor = "00000000-0000-4000-8000-000000000011";
  const workspace = "00000000-0000-4000-8000-000000000012";
  const course = "00000000-0000-4000-8000-000000000013";
  const cost = "00000000-0000-4000-8000-000000000014";
  try {
    await db.exec(`
      create role service_role; create role anon; create role authenticated;
      create table public.courses (id uuid primary key, workspace_id uuid not null, name text not null);
      create table public.workspace_members (workspace_id uuid not null, user_id uuid not null);
      create table public.course_costs (id uuid primary key, course_id uuid not null, category_code text not null, name text not null, gross_amount bigint not null, paid_date date, deleted_at timestamptz);
      create table public.cash_ledger_settings (workspace_id uuid primary key, start_date date not null);
      create table public.cash_ledger_parties (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, name text not null, note text not null default '', source_key text, constraint cash_ledger_parties_workspace_source_key_key unique (workspace_id, source_key));
      create table public.cash_ledger_entries (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, kind text not null, title text not null, party_id uuid not null, course_id uuid, amount bigint not null, entry_date date not null, note text not null);
      insert into public.courses values ('${course}', '${workspace}', '오프라인 강의');
      insert into public.workspace_members values ('${workspace}', '${actor}');
      insert into public.cash_ledger_settings values ('${workspace}', '2026-11-01');
      insert into public.course_costs values ('${cost}', '${course}', 'OFFLINE_VENUE', '장소 대관료', 120000, '2026-11-03', null);
    `);
    await db.exec(await readFile("supabase/migrations/20261104082457_link_ad_operation_costs_to_cash_ledger.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261113094051_add_offline_venue_ledger_expense.sql", "utf8"));
    const record = () => db.query<{ record_course_ad_operation_ledger_expense: string }>(
      "select public.record_course_ad_operation_ledger_expense($1, $2, $3)", [course, cost, actor],
    );
    const first = (await record()).rows[0].record_course_ad_operation_ledger_expense;
    const entry = (await db.query<{ amount: number; party_name: string; title: string }>(`
      select entry.amount, party.name as party_name, entry.title
      from public.cash_ledger_entries as entry join public.cash_ledger_parties as party on party.id = entry.party_id
      where entry.id = $1
    `, [first])).rows[0];
    assert.deepEqual(entry, { amount: 120000, party_name: "오프라인 장소 이용료", title: "오프라인 장소 이용료 - 오프라인 강의" });
    await db.query("update public.course_costs set gross_amount=150000 where id=$1", [cost]);
    assert.equal((await record()).rows[0].record_course_ad_operation_ledger_expense, first);
    assert.deepEqual((await db.query<{ count: number; amount: number }>(`
      select count(*)::int as count, max(amount)::int as amount from public.cash_ledger_entries
    `)).rows[0], { count: 1, amount: 150000 });
  } finally {
    await db.close();
  }
});
