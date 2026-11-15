import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("소재성과 설정은 워크스페이스별로 저장하고 일반 DB 접근을 차단한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.workspaces(id uuid primary key);
      insert into public.workspaces values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');`);
    await db.exec(await readFile("supabase/migrations/20261115161018_add_ad_creative_performance_source.sql", "utf8"));
    await db.exec(`insert into public.ad_creative_sources (workspace_id, spreadsheet_url, rows) values
      ('00000000-0000-4000-8000-000000000001', 'https://example.test/1', '[{"ad":"one"}]'),
      ('00000000-0000-4000-8000-000000000002', 'https://example.test/2', '[]');`);
    assert.equal((await db.query("select * from public.ad_creative_sources where workspace_id='00000000-0000-4000-8000-000000000001'")).rows.length, 1);
    await assert.rejects(() => db.exec("update public.ad_creative_sources set rows = '{}'"), /check constraint/u);
    await db.exec("set role authenticated");
    await assert.rejects(() => db.query("select * from public.ad_creative_sources"), /permission denied/u);
    await db.exec("reset role; set role anon");
    await assert.rejects(() => db.query("select * from public.ad_creative_sources"), /permission denied/u);
  } finally { await db.close(); }
});
