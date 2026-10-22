import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("외부마케팅대행 프로젝트는 강의 없이 광고 대시보드에 연결되고 토큰과 RLS를 갖는다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create role service_role;
      create schema auth;
      create schema extensions;
      create function extensions.gen_random_bytes(size integer) returns bytea language sql volatile as $$ select decode(substr(md5(random()::text) || md5(random()::text), 1, size * 2), 'hex') $$;
      create table auth.users(id uuid primary key);
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid, user_id uuid);
      create table public.courses(id uuid primary key, workspace_id uuid not null references public.workspaces(id), name text not null, instructor_name text not null, starts_at timestamptz not null);
      create function public.is_workspace_member(target_workspace uuid) returns boolean language sql stable as $$ select exists(select 1 from public.workspace_members where workspace_id=target_workspace) $$;
    `);
    await db.exec(await readFile("supabase/migrations_archive/20260929/202609230004_ad_performance_dashboard.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations_archive/20260929/202609230005_course_ad_performance_dashboards.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261001144602_allow_unassigned_ad_performance_dashboards.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/20261022103325_external_marketing_service.sql", "utf8"));
    const workspaceId = "00000000-0000-4000-8000-000000000011";
    const userId = "00000000-0000-4000-8000-000000000012";
    const dashboardId = "00000000-0000-4000-8000-000000000013";
    await db.exec(`insert into auth.users values ('${userId}'); insert into public.workspaces values ('${workspaceId}'); insert into public.workspace_members values ('${workspaceId}','${userId}');`);
    await db.query(`insert into public.ad_performance_dashboards(id,workspace_id,course_id,start_date,total_budget,created_by,updated_by) values ($1,$2,null,'2026-10-01',30000000,$3,$3)`, [dashboardId, workspaceId, userId]);
    await db.query(`insert into public.external_marketing_projects(dashboard_id,workspace_id,course_name,landing_pages,created_by,updated_by) values ($1,$2,'외부 강의','[{"channel":"Google","url":"https://example.com"}]'::jsonb,$3,$3)`, [dashboardId, workspaceId, userId]);
    const row = (await db.query<{ intake_token: string; public_token: string }>("select intake_token,public_token from public.external_marketing_projects where dashboard_id=$1", [dashboardId])).rows[0];
    assert.match(row.intake_token, /^[a-f0-9]{48}$/u);
    assert.match(row.public_token, /^[a-f0-9]{48}$/u);
    assert.notEqual(row.intake_token, row.public_token);
    const policies = await db.query<{ policyname: string }>("select policyname from pg_policies where tablename='external_marketing_projects'");
    assert.ok(policies.rows.some((policy) => policy.policyname === "members manage external marketing projects"));
    await db.query("delete from public.ad_performance_dashboards where id=$1", [dashboardId]);
    assert.equal((await db.query("select * from public.external_marketing_projects")).rows.length, 0);
  } finally {
    await db.close();
  }
});
