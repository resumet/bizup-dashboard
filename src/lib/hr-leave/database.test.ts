import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const adminId = "00000000-0000-4000-8000-000000000002";
const employeeId = "00000000-0000-4000-8000-000000000003";

test("휴가 DB가 기본 부여·사용 신청·추가휴가를 서로 분리해 저장한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid, user_id uuid, role text);
      create function public.is_workspace_member(target_workspace uuid) returns boolean language sql stable as
        $$ select exists(select 1 from public.workspace_members where workspace_id = target_workspace) $$;
      insert into auth.users values ('${adminId}'), ('${employeeId}');
      insert into public.workspaces values ('${workspaceId}');
      insert into public.workspace_members values
        ('${workspaceId}', '${adminId}', 'admin'),
        ('${workspaceId}', '${employeeId}', 'user');
    `);
    await db.exec(await readFile("supabase/migrations/202609210002_hr_leave_management.sql", "utf8"));
    await db.query(
      `insert into public.hr_leave_profiles
        (workspace_id,user_id,employment_start_date,created_by,updated_by)
       values ($1,$2,'2026-09-21',$3,$3)`,
      [workspaceId, employeeId, adminId],
    );
    await db.query(
      `insert into public.hr_annual_leave_grants
        (workspace_id,user_id,grant_year,granted_days,employment_start_date,granted_by)
       values ($1,$2,2026,4,'2026-09-21',$3)`,
      [workspaceId, employeeId, adminId],
    );
    await db.query(
      `insert into public.hr_leave_requests(workspace_id,user_id,leave_date,unit,reason)
       values ($1,$2,'2026-10-02','pm','병원')`,
      [workspaceId, employeeId],
    );
    await db.query(
      `insert into public.hr_leave_support_records(workspace_id,user_id,support_date,support_type,unit,note,status)
       values ($1,$2,'2026-09-20','night_webinar','half','웨비나 지원','approved')`,
      [workspaceId, employeeId],
    );

    const request = await db.query<{ days: string }>("select days from public.hr_leave_requests");
    const support = await db.query<{ earned_days: string }>("select earned_days from public.hr_leave_support_records");
    assert.equal(Number(request.rows[0].days), 0.5);
    assert.equal(Number(support.rows[0].earned_days), 0.5);
    assert.equal((await db.query("select * from public.hr_annual_leave_grants")).rows.length, 1);
    assert.equal((await db.query("select * from public.hr_leave_support_records")).rows.length, 1);

    await assert.rejects(
      db.query(
        `insert into public.hr_leave_support_records
          (workspace_id,user_id,support_date,support_type,unit)
         values ($1,$2,'2026-09-19','night_webinar','full')`,
        [workspaceId, employeeId],
      ),
      /hr_leave_support_records_check/,
    );
  } finally {
    await db.close();
  }
});
