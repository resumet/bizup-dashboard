import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

test("광고 설정과 날짜별 Google·Meta 원시 지표를 저장한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid, user_id uuid);
      create function public.is_workspace_member(target_workspace uuid)
      returns boolean language sql stable as
        $$ select exists(select 1 from public.workspace_members where workspace_id = target_workspace) $$;
      insert into auth.users values ('${userId}');
      insert into public.workspaces values ('${workspaceId}');
      insert into public.workspace_members values ('${workspaceId}', '${userId}');
    `);
    await db.exec(await readFile("supabase/migrations/202609230004_ad_performance_dashboard.sql", "utf8"));

    await db.query(
      `insert into public.ad_performance_settings
        (workspace_id,start_date,total_budget,created_by,updated_by)
       values ($1,'2026-09-01',1000000,$2,$2)`,
      [workspaceId, userId],
    );
    await db.query(
      `insert into public.ad_performance_daily_metrics
        (workspace_id,metric_date,google_impressions,meta_impressions,google_clicks,meta_clicks,
         google_ad_leads,meta_ad_leads,google_spend,meta_spend,landing_leads,
         google_admin_leads,meta_admin_leads,created_by,updated_by)
       values ($1,'2026-09-01',8000,2000,200,100,20,10,300000,200000,25,19,9,$2,$2)`,
      [workspaceId, userId],
    );

    const result = await db.query<{
      impressions: string;
      clicks: string;
      leads: string;
      spend: string;
      landing_leads: string;
      admin_leads: string;
    }>(`
      select
        sum(google_impressions + meta_impressions) impressions,
        sum(google_clicks + meta_clicks) clicks,
        sum(google_ad_leads + meta_ad_leads) leads,
        sum(google_spend + meta_spend) spend,
        sum(landing_leads) landing_leads,
        sum(google_admin_leads + meta_admin_leads) admin_leads
      from public.ad_performance_daily_metrics
    `);
    assert.deepEqual(Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)])), {
      impressions: 10_000,
      clicks: 300,
      leads: 30,
      spend: 500_000,
      landing_leads: 25,
      admin_leads: 28,
    });

    await assert.rejects(
      db.query(
        `insert into public.ad_performance_daily_metrics
          (workspace_id,metric_date,google_spend,created_by,updated_by)
         values ($1,'2026-09-02',-1,$2,$2)`,
        [workspaceId, userId],
      ),
      /google_spend_check/,
    );
  } finally {
    await db.close();
  }
});
