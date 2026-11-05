import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const representativeId = "00000000-0000-4000-8000-000000000002";
const employeeId = "00000000-0000-4000-8000-000000000003";
const outsiderId = "00000000-0000-4000-8000-000000000004";

test("대표 배정 할일은 기존 업무 테이블에서 할당·완료보고·상태 이력을 보존한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create schema personnel_private;
      create table auth.users(id uuid primary key, email text);
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(
        workspace_id uuid not null,
        user_id uuid not null,
        role text not null default 'user'
      );
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.is_workspace_member(target_workspace uuid) returns boolean language sql stable as
        $$ select exists(
          select 1 from public.workspace_members
          where workspace_id = target_workspace and user_id = auth.uid()
        ) $$;
      create table personnel_private.employees(
        workspace_id uuid not null,
        user_id uuid,
        status text not null
      );
      create function public.personnel_access(p_workspace_id uuid, p_user_id uuid)
      returns boolean language sql stable security definer set search_path=public,pg_temp as
        $$ select exists(
          select 1 from public.workspace_members
          where workspace_id=p_workspace_id and user_id=p_user_id
        ) and not exists(
          select 1 from personnel_private.employees
          where workspace_id=p_workspace_id and user_id=p_user_id and status<>'employed'
        ) $$;
      insert into auth.users values
        ('${representativeId}', 'representative@example.test'),
        ('${employeeId}', 'employee@example.test'),
        ('${outsiderId}', 'outsider@example.test');
      insert into public.workspaces values ('${workspaceId}');
      insert into public.workspace_members values
        ('${workspaceId}', '${representativeId}', 'super_admin'),
        ('${workspaceId}', '${employeeId}', 'user');
      insert into personnel_private.employees values
        ('${workspaceId}', '${employeeId}', 'employed');
    `);

    for (const migration of [
      "supabase/migrations_archive/20260929/202609190002_work_tasks.sql",
      "supabase/migrations_archive/20260929/202609190003_work_task_reviews_and_security.sql",
      "supabase/migrations_archive/20260929/202609190004_work_task_atomic_commands.sql",
      "supabase/migrations_archive/20260929/202609190005_work_task_edit_command.sql",
      "supabase/migrations/20261105132457_personal_dashboards.sql",
      "supabase/migrations/20261105140500_executive_assignment_personnel_guard.sql",
    ]) {
      await db.exec(await readFile(migration, "utf8"));
    }

    const created = await db.query<{
      task: {
        id: string;
        title: string;
        task_kind: string;
        status: string;
        assignee_id: string;
      };
    }>(
      "select public.create_executive_assignment_with_event($1,$2,$3,$4,$5) task",
      [workspaceId, "인스타그램 릴스 수집해", "2026-11-05", representativeId, employeeId],
    );
    const task = created.rows[0].task;
    assert.equal(task.title, "인스타그램 릴스 수집해");
    assert.equal(task.task_kind, "executive_assignment");
    assert.equal(task.status, "assigned");
    assert.equal(task.assignee_id, employeeId);

    const eventsAfterCreation = await db.query<{ event_type: string }>(
      "select event_type from public.work_task_events where task_id=$1 order by id",
      [task.id],
    );
    assert.deepEqual(eventsAfterCreation.rows.map((event) => event.event_type), ["created", "transferred"]);

    await assert.rejects(
      db.query(
        "select public.create_executive_assignment_with_event($1,$2,$3,$4,$5)",
        [workspaceId, "권한 없는 배정", "2026-11-05", employeeId, representativeId],
      ),
      /CREATOR_NOT_SUPER_ADMIN/,
    );
    await assert.rejects(
      db.query(
        "select public.create_executive_assignment_with_event($1,$2,$3,$4,$5)",
        [workspaceId, "외부 사용자 배정", "2026-11-05", representativeId, outsiderId],
      ),
      /ASSIGNEE_NOT_IN_WORKSPACE/,
    );

    const completed = await db.query<{
      task: { status: string; completion_report: string; completed_at: string | null };
    }>(
      "select public.set_executive_assignment_status_with_report($1,$2,$3,$4,$5) task",
      [task.id, workspaceId, employeeId, "completed", "릴스 12개를 정리했습니다."],
    );
    assert.equal(completed.rows[0].task.status, "completed");
    assert.equal(completed.rows[0].task.completion_report, "릴스 12개를 정리했습니다.");
    assert.ok(completed.rows[0].task.completed_at);

    const reopened = await db.query<{
      task: { status: string; completion_report: string; completed_at: string | null };
    }>(
      "select public.set_executive_assignment_status_with_report($1,$2,$3,$4,$5) task",
      [task.id, workspaceId, representativeId, "assigned", "릴스 12개를 정리했습니다."],
    );
    assert.equal(reopened.rows[0].task.status, "assigned");
    assert.equal(reopened.rows[0].task.completion_report, "릴스 12개를 정리했습니다.");
    assert.equal(reopened.rows[0].task.completed_at, null);

    const finalEvents = await db.query<{ event_type: string }>(
      "select event_type from public.work_task_events where task_id=$1 order by id",
      [task.id],
    );
    assert.deepEqual(finalEvents.rows.map((event) => event.event_type), [
      "created",
      "transferred",
      "completed",
      "reopened",
    ]);

    await assert.rejects(
      db.query(
        "update personnel_private.employees set status='resigned' where workspace_id=$1 and user_id=$2",
        [workspaceId, employeeId],
      ),
      /미완료 업무/,
    );

    await db.query(
      "select public.set_executive_assignment_status_with_report($1,$2,$3,$4,$5)",
      [task.id, workspaceId, employeeId, "completed", "최종 보고"],
    );
    await db.query(
      "update personnel_private.employees set status='resigned' where workspace_id=$1 and user_id=$2",
      [workspaceId, employeeId],
    );
    await assert.rejects(
      db.query(
        "select public.create_executive_assignment_with_event($1,$2,$3,$4,$5)",
        [workspaceId, "퇴직자 배정", "2026-11-05", representativeId, employeeId],
      ),
      /퇴직한 직원/,
    );

    await db.query(
      "insert into public.personal_dashboard_memos(workspace_id,user_id,content) values($1,$2,$3)",
      [workspaceId, employeeId, "개인 메모"],
    );
    const memos = await db.query<{ content: string }>(
      "select content from public.personal_dashboard_memos where user_id=$1",
      [employeeId],
    );
    assert.deepEqual(memos.rows, [{ content: "개인 메모" }]);
  } finally {
    await db.close();
  }
});
