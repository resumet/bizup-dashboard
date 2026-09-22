import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const courseId = "00000000-0000-4000-8000-000000000003";
const dashboardId = "00000000-0000-4000-8000-000000000004";
const blogChannelId = "00000000-0000-4000-8000-000000000005";
const youtubeChannelId = "00000000-0000-4000-8000-000000000006";

test("강의마다 하나의 광고성과 대시보드와 날짜별 지표를 저장한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid, user_id uuid);
      create table public.courses(
        id uuid primary key,
        workspace_id uuid not null references public.workspaces(id) on delete cascade,
        name text not null,
        instructor_name text not null,
        starts_at timestamptz not null
      );
      create function public.is_workspace_member(target_workspace uuid)
      returns boolean language sql stable as
        $$ select exists(select 1 from public.workspace_members where workspace_id = target_workspace) $$;
      insert into auth.users values ('${userId}');
      insert into public.workspaces values ('${workspaceId}');
      insert into public.workspace_members values ('${workspaceId}', '${userId}');
      insert into public.courses values ('${courseId}', '${workspaceId}', '마케팅 강의', '김강사', '2026-10-01T00:00:00Z');
    `);
    await db.exec(await readFile("supabase/migrations/202609230004_ad_performance_dashboard.sql", "utf8"));
    await db.exec(await readFile("supabase/migrations/202609230005_course_ad_performance_dashboards.sql", "utf8"));

    await db.query(
      `insert into public.ad_performance_dashboards
        (id,workspace_id,course_id,start_date,total_budget,created_by,updated_by)
       values ($1,$2,$3,'2026-09-01',1000000,$4,$4)`,
      [dashboardId, workspaceId, courseId, userId],
    );
    await db.query(
      `insert into public.ad_performance_dashboard_metrics
        (dashboard_id,metric_date,google_impressions,meta_impressions,google_clicks,meta_clicks,
         google_ad_leads,meta_ad_leads,google_spend,meta_spend,google_landing_leads,
         meta_landing_leads,admin_cumulative_leads,created_by,updated_by)
       values ($1,'2026-09-01',8000,2000,200,100,20,10,300000,200000,18,7,28,$2,$2)`,
      [dashboardId, userId],
    );
    await db.query(
      `insert into public.ad_performance_organic_channels(id,dashboard_id,name,sort_order,created_by)
       values ($1,$2,'블로그',0,$3),($4,$2,'유튜브',1,$3)`,
      [blogChannelId, dashboardId, userId, youtubeChannelId],
    );
    await db.query(
      `insert into public.ad_performance_organic_metric_values
        (dashboard_id,channel_id,metric_date,lead_count,created_by,updated_by)
       values ($1,$2,'2026-09-01',5,$4,$4),($1,$3,'2026-09-01',3,$4,$4)`,
      [dashboardId, blogChannelId, youtubeChannelId, userId],
    );

    const result = await db.query<{
      impressions: string;
      clicks: string;
      leads: string;
      spend: string;
      paid_landing_leads: string;
      admin_cumulative_leads: string;
    }>(`
      select
        sum(google_impressions + meta_impressions) impressions,
        sum(google_clicks + meta_clicks) clicks,
        sum(google_ad_leads + meta_ad_leads) leads,
        sum(google_spend + meta_spend) spend,
        sum(google_landing_leads + meta_landing_leads) paid_landing_leads,
        max(admin_cumulative_leads) admin_cumulative_leads
      from public.ad_performance_dashboard_metrics
      where dashboard_id = '${dashboardId}'
    `);
    assert.deepEqual(Object.fromEntries(Object.entries(result.rows[0]).map(([key, value]) => [key, Number(value)])), {
      impressions: 10_000,
      clicks: 300,
      leads: 30,
      spend: 500_000,
      paid_landing_leads: 25,
      admin_cumulative_leads: 28,
    });
    const summary = await db.query<{ metric_count: string; spend: string; ad_leads: string; paid_landing_leads: string; organic_landing_leads: string; admin_cumulative_leads: string }>(
      "select metric_count,spend,ad_leads,paid_landing_leads,organic_landing_leads,admin_cumulative_leads from public.ad_performance_dashboard_summaries where id = $1",
      [dashboardId],
    );
    assert.deepEqual(Object.fromEntries(Object.entries(summary.rows[0]).map(([key, value]) => [key, Number(value)])), {
      metric_count: 1,
      spend: 500_000,
      ad_leads: 30,
      paid_landing_leads: 25,
      organic_landing_leads: 8,
      admin_cumulative_leads: 28,
    });

    await assert.rejects(
      db.query(
        `insert into public.ad_performance_dashboards
          (workspace_id,course_id,start_date,total_budget,created_by,updated_by)
         values ($1,$2,'2026-09-02',0,$3,$3)`,
        [workspaceId, courseId, userId],
      ),
      /ad_performance_dashboards_workspace_id_course_id_key/,
    );
    await assert.rejects(
      db.query(
        `insert into public.ad_performance_dashboard_metrics
          (dashboard_id,metric_date,google_spend,created_by,updated_by)
         values ($1,'2026-09-02',-1,$2,$2)`,
        [dashboardId, userId],
      ),
      /google_spend_check/,
    );

    await db.query("delete from public.ad_performance_dashboards where id = $1", [dashboardId]);
    assert.equal((await db.query("select * from public.ad_performance_dashboard_metrics")).rows.length, 0);
    assert.equal((await db.query("select * from public.ad_performance_organic_channels")).rows.length, 0);
    assert.equal((await db.query("select * from public.ad_performance_organic_metric_values")).rows.length, 0);
  } finally {
    await db.close();
  }
});
