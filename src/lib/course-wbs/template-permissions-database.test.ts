import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const workspaceA = "00000000-0000-4000-8000-000000000021";
const workspaceB = "00000000-0000-4000-8000-000000000022";
const userA = "00000000-0000-4000-8000-000000000023";
const userB = "00000000-0000-4000-8000-000000000024";

test("workspace members may read WBS templates but cannot write them directly", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.workspaces (id uuid primary key);
      create table public.workspace_members (workspace_id uuid, user_id uuid);
      create function public.is_workspace_member(target_workspace uuid)
      returns boolean language sql stable security definer as
        $$ select exists(select 1 from public.workspace_members m
          where m.workspace_id = target_workspace and m.user_id = auth.uid()) $$;
      create table public.courses (id uuid primary key, workspace_id uuid not null);
    `);
    await db.query("insert into auth.users values ($1), ($2)", [userA, userB]);
    await db.query("insert into public.workspaces values ($1), ($2)", [workspaceA, workspaceB]);
    await db.query("insert into public.workspace_members values ($1, $2), ($3, $4)", [workspaceA, userA, workspaceB, userB]);
    await db.exec(await readFile("supabase/migrations/202609270001_course_wbs.sql", "utf8"));
    await db.query(
      "insert into public.course_wbs_templates (workspace_id, id, name) values ($1, 'template', 'Workspace A'), ($2, 'template', 'Workspace B')",
      [workspaceA, workspaceB],
    );

    // Simulate inherited PUBLIC access as well as explicit API-role grants.
    // The service role keeps its own grant for server-authorized saves.
    await db.exec("grant select, insert, update, delete on public.course_wbs_templates to public, authenticated, service_role");
    const migration = await readFile("supabase/migrations/202609270004_course_wbs_template_permissions.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
    await db.exec("set role authenticated");
    assert.deepEqual(
      (await db.query<{ name: string }>("select name from public.course_wbs_templates")).rows,
      [{ name: "Workspace A" }],
    );
    await assert.rejects(
      db.query("update public.course_wbs_templates set name = 'Changed' where workspace_id = $1", [workspaceA]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("insert into public.course_wbs_templates (workspace_id, id, name) values ($1, 'new', 'New')", [workspaceA]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from public.course_wbs_templates where workspace_id = $1", [workspaceA]),
      /permission denied/,
    );

    await db.exec("reset role");
    await db.exec("set role anon");
    await assert.rejects(
      db.query("update public.course_wbs_templates set name = 'Anonymous Change' where workspace_id = $1", [workspaceA]),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec("set role service_role");
    const serverUpdate = await db.query(
      "update public.course_wbs_templates set name = 'Server Updated' where workspace_id = $1 returning id",
      [workspaceA],
    );
    assert.equal(serverUpdate.rows.length, 1);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
