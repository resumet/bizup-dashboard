import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("공개 보고서 단톡방 입력 함수는 수동 입력과 지표를 원자적으로 갱신하고 권한을 제한한다", async () => {
  const db = new PGlite();
  const dashboardId = "00000000-0000-4000-8000-000000000021";
  const workspaceId = "00000000-0000-4000-8000-000000000022";
  const token = "a".repeat(48);

  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create role service_role;
      create table public.ad_performance_dashboards (
        id uuid primary key,
        workspace_id uuid not null,
        service_scope text not null,
        updated_at timestamptz not null default now()
      );
      create table public.external_marketing_projects (
        dashboard_id uuid primary key,
        workspace_id uuid not null,
        public_token text not null unique,
        public_enabled boolean not null default false
      );
      create table public.ad_performance_sheet_states (
        dashboard_id uuid primary key,
        manual_inputs jsonb not null default '{}'::jsonb,
        version integer not null default 1,
        updated_at timestamptz not null default now()
      );
      create table public.ad_performance_dashboard_metrics (
        dashboard_id uuid not null,
        metric_date date not null,
        chat_room_members bigint,
        managed_by_sheet boolean not null default false,
        updated_at timestamptz not null default now(),
        primary key (dashboard_id, metric_date)
      );
    `);
    await db.exec(await readFile("supabase/migrations/20261023023646_public_external_marketing_chat_members.sql", "utf8"));
    await db.query("insert into public.ad_performance_dashboards(id,workspace_id,service_scope) values($1,$2,'external_marketing')", [dashboardId, workspaceId]);
    await db.query("insert into public.external_marketing_projects(dashboard_id,workspace_id,public_token,public_enabled) values($1,$2,$3,true)", [dashboardId, workspaceId, token]);
    await db.query(`insert into public.ad_performance_sheet_states(dashboard_id,manual_inputs,version) values($1,$2::jsonb,3)`, [dashboardId, JSON.stringify({
      "2026-11-23": { bizupDbCumulative: 17, chatMembersCumulative: null },
      "2026-11-24": { bizupDbCumulative: null, chatMembersCumulative: null },
    })]);
    await db.query("insert into public.ad_performance_dashboard_metrics(dashboard_id,metric_date,managed_by_sheet) values($1,'2026-11-23',true),($1,'2026-11-24',true)", [dashboardId]);

    const version = await db.query<{ save_public_external_marketing_chat_members: number }>(
      "select public.save_public_external_marketing_chat_members($1,'2026-11-23',120)",
      [token],
    );
    assert.equal(version.rows[0].save_public_external_marketing_chat_members, 4);
    await db.query("select public.save_public_external_marketing_chat_members($1,'2026-11-24',null)", [token]);

    const state = (await db.query<{ manual_inputs: Record<string, unknown>; version: number }>(
      "select manual_inputs,version from public.ad_performance_sheet_states where dashboard_id=$1",
      [dashboardId],
    )).rows[0];
    assert.equal(state.version, 5);
    assert.deepEqual(state.manual_inputs, {
      "2026-11-23": { bizupDbCumulative: 17, chatMembersCumulative: 120 },
    });
    assert.equal((await db.query<{ chat_room_members: number }>(
      "select chat_room_members from public.ad_performance_dashboard_metrics where dashboard_id=$1 and metric_date='2026-11-23'",
      [dashboardId],
    )).rows[0].chat_room_members, 120);

    const privileges = (await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(`
      select
        has_function_privilege('anon','public.save_public_external_marketing_chat_members(text,date,bigint)','EXECUTE') as anon,
        has_function_privilege('authenticated','public.save_public_external_marketing_chat_members(text,date,bigint)','EXECUTE') as authenticated,
        has_function_privilege('service_role','public.save_public_external_marketing_chat_members(text,date,bigint)','EXECUTE') as service_role
    `)).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: false, service_role: true });

    await assert.rejects(
      db.query("select public.save_public_external_marketing_chat_members($1,'2026-11-23',-1)", [token]),
      /단톡방 누적 입장 인원이 올바르지 않습니다/u,
    );
    await assert.rejects(
      db.query("select public.save_public_external_marketing_chat_members($1,'2026-11-25',1)", [token]),
      /공개 보고서의 날짜를 찾을 수 없습니다/u,
    );
    await db.query("update public.external_marketing_projects set public_enabled=false where dashboard_id=$1", [dashboardId]);
    await assert.rejects(
      db.query("select public.save_public_external_marketing_chat_members($1,'2026-11-23',1)", [token]),
      /공개 보고서의 날짜를 찾을 수 없습니다/u,
    );
  } finally {
    await db.close();
  }
});
