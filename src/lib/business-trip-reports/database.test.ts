import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

test("출장보고서 DB가 비용·지급 상태·파일 메타데이터를 일관되게 저장한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.workspaces(id uuid primary key);
      insert into auth.users values ('${userId}');
      insert into public.workspaces values ('${workspaceId}');
    `);
    const migration = await readFile("supabase/migrations/20261029010230_business_trip_reports.sql", "utf8");
    await db.exec(migration.split("insert into storage.buckets")[0]);
    await db.query(
      `insert into public.business_trip_reports
        (workspace_id,author_id,author_name,title,final_cost,payment_completed,payment_completed_at)
       values ($1,$2,'권정인','부산 출장',125000,true,now())`,
      [workspaceId, userId],
    );
    const result = await db.query<{ title: string; final_cost: string; payment_completed: boolean }>(
      "select title,final_cost,payment_completed from public.business_trip_reports",
    );
    assert.deepEqual(result.rows.map((row) => ({ ...row, final_cost: Number(row.final_cost) })), [{
      title: "부산 출장",
      final_cost: 125000,
      payment_completed: true,
    }]);

    await assert.rejects(
      db.query(
        `insert into public.business_trip_reports
          (workspace_id,author_id,author_name,title,final_cost,payment_completed)
         values ($1,$2,'권정인','잘못된 지급 상태',1,true)`,
        [workspaceId, userId],
      ),
      /business_trip_reports_payment_state_check/,
    );
    await assert.rejects(
      db.query(
        `insert into public.business_trip_reports
          (workspace_id,author_id,author_name,title,file_path)
         values ($1,$2,'권정인','불완전한 파일','path/report.pdf')`,
        [workspaceId, userId],
      ),
      /business_trip_reports_file_state_check/,
    );
  } finally {
    await db.close();
  }
});
