import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";

test("메뉴 검색어 설정 DB는 워크스페이스별 JSON과 서버 전용 접근을 강제한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.workspaces(id uuid primary key);
      insert into auth.users values ('${USER}');
      insert into public.workspaces values ('${WORKSPACE}');
    `);
    await db.exec(await readFile("supabase/migrations/20261027051533_dashboard_menu_search_keywords.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261027051618_dashboard_menu_search_settings_updated_by_index.sql", "utf8"));

    await db.exec("set role anon");
    await assert.rejects(() => db.query("select * from public.dashboard_menu_search_settings"), /permission denied/u);
    await db.exec("reset role; set role authenticated");
    await assert.rejects(() => db.query("select * from public.dashboard_menu_search_settings"), /permission denied/u);

    await db.exec("reset role; set role service_role");
    await db.query(
      `insert into public.dashboard_menu_search_settings (workspace_id, keywords, updated_by)
       values ($1, $2::jsonb, $3)`,
      [WORKSPACE, JSON.stringify({ "/services/course-wbs": ["오늘 업무"] }), USER],
    );
    const saved = await db.query<{ keywords: Record<string, string[]> }>(
      "select keywords from public.dashboard_menu_search_settings where workspace_id = $1",
      [WORKSPACE],
    );
    assert.deepEqual(saved.rows[0]?.keywords, { "/services/course-wbs": ["오늘 업무"] });
    const indexes = await db.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public' and tablename = 'dashboard_menu_search_settings'",
    );
    assert.equal(indexes.rows.some((row) => row.indexname === "dashboard_menu_search_settings_updated_by_idx"), true);
    await assert.rejects(() => db.query(
      "update public.dashboard_menu_search_settings set keywords = $1::jsonb",
      [JSON.stringify([])],
    ), /dashboard_menu_search_settings_keywords_object_check/u);
  } finally {
    await db.close();
  }
});
