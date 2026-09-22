import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export const personnelFixtureIds = {
  workspace: "00000000-0000-4000-8000-000000000001",
  root: "00000000-0000-4000-8000-000000000002",
  staff: "00000000-0000-4000-8000-000000000003",
  manager: "00000000-0000-4000-8000-000000000004",
  outsider: "00000000-0000-4000-8000-000000000005",
};
export async function createPersonnelFixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.workspaces(id uuid primary key);
    create table public.workspace_members(workspace_id uuid references public.workspaces,user_id uuid references auth.users,role text,created_at timestamptz default '2020-01-01',primary key(workspace_id,user_id));
    create function public.is_workspace_member(w uuid) returns boolean language sql stable as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid()) $$;
  `);
  const ids = personnelFixtureIds;
  await db.query("insert into public.workspaces values($1)", [ids.workspace]);
  for (const [id, email, role] of [[ids.root, "resumet@gmail.com", "super_admin"], [ids.staff, "staff@example.test", "user"], [ids.manager, "manager@example.test", "admin"], [ids.outsider, "outside@example.test", "user"]]) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [id, email]);
    if (id !== ids.outsider) await db.query("insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,$3)", [ids.workspace, id, role]);
  }
  for (const name of ["202609190002_work_tasks", "202609190003_work_task_reviews_and_security", "202609190004_work_task_atomic_commands", "202609190005_work_task_edit_command", "202609210002_hr_leave_management", "202609220001_hr_leave_year_reset", "202609230001_workspace_personnel", "202609230002_personnel_payroll"]) {
    await db.exec(await readFile(`supabase/migrations/${name}.sql`, "utf8"));
  }
  await db.exec("grant usage on schema public,auth to authenticated,service_role; grant select on public.workspace_members to authenticated; grant select on public.work_tasks,public.work_task_events,public.work_daily_reviews to authenticated; grant all on all tables in schema public to service_role;");
  return db;
}
