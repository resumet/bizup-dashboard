import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const creatorId = "00000000-0000-4000-8000-000000000002";
const teammateId = "00000000-0000-4000-8000-000000000003";
const outsiderId = "00000000-0000-4000-8000-000000000004";

test("새 HR 업무 명령은 변경과 히스토리를 한 트랜잭션에 저장한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid not null, user_id uuid not null);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function public.is_workspace_member(target_workspace uuid) returns boolean language sql stable as
        $$ select exists(select 1 from public.workspace_members where workspace_id = target_workspace) $$;
      insert into auth.users values ('${creatorId}'), ('${teammateId}'), ('${outsiderId}');
      insert into public.workspaces values ('${workspaceId}');
      insert into public.workspace_members values ('${workspaceId}', '${creatorId}'), ('${workspaceId}', '${teammateId}');
    `);
    for (const migration of [
      "supabase/migrations/202609190002_work_tasks.sql",
      "supabase/migrations/202609190003_work_task_reviews_and_security.sql",
      "supabase/migrations/202609190004_work_task_atomic_commands.sql",
    ]) await db.exec(await readFile(migration, "utf8"));

    const created = await db.query<{ task: { id: string; assignee_id: string; status: string } }>(
      "select public.create_work_task_with_event($1,$2,$3,$4,$5) task",
      [workspaceId, "고객 명단 정리", "오후까지 완료", "2026-09-19", creatorId],
    );
    const task = created.rows[0].task;
    assert.equal(task.assignee_id, creatorId);
    assert.equal(task.status, "open");

    const transferred = await db.query<{ task: { assignee_id: string } }>(
      "select public.transfer_work_task_with_event($1,$2,$3,$4,$5,$6) task",
      [task.id, workspaceId, creatorId, teammateId, "오후 업무 이관", false],
    );
    assert.equal(transferred.rows[0].task.assignee_id, teammateId);

    const completed = await db.query<{ task: { status: string; completed_at: string } }>(
      "select public.set_work_task_status_with_event($1,$2,$3,$4,$5) task",
      [task.id, workspaceId, teammateId, "done", false],
    );
    assert.equal(completed.rows[0].task.status, "done");
    assert.ok(completed.rows[0].task.completed_at);

    const events = await db.query<{
      event_type: string;
      actor_id: string;
      from_assignee_id: string | null;
      to_assignee_id: string | null;
    }>("select event_type,actor_id,from_assignee_id,to_assignee_id from public.work_task_events order by id");
    assert.deepEqual(events.rows.map((event) => event.event_type), ["created", "transferred", "completed"]);
    assert.equal(events.rows[1].actor_id, creatorId);
    assert.equal(events.rows[1].from_assignee_id, creatorId);
    assert.equal(events.rows[1].to_assignee_id, teammateId);

    await assert.rejects(
      db.query(
        "select public.transfer_work_task_with_event($1,$2,$3,$4,$5,$6)",
        [task.id, workspaceId, teammateId, outsiderId, "", false],
      ),
      /ASSIGNEE_NOT_IN_WORKSPACE/,
    );
    assert.equal((await db.query("select * from public.work_task_events")).rows.length, 3);
  } finally {
    await db.close();
  }
});
