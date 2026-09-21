import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const draftId = "00000000-0000-4000-8000-000000000003";
const deletedDraftId = "00000000-0000-4000-8000-000000000004";

test("예비 강의 전용 테이블이 기존 로그를 이전하고 전체 필드를 저장한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select null::uuid $$;
      create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid, user_id uuid);
      create function public.is_workspace_member(target_workspace uuid)
      returns boolean language sql stable as
        $$ select exists(select 1 from public.workspace_members where workspace_id = target_workspace) $$;
      create table public.audit_logs(
        id bigint generated always as identity primary key,
        workspace_id uuid,
        actor_id uuid,
        event_type text not null,
        entity_type text not null,
        entity_id text,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      insert into auth.users values ('${userId}');
      insert into public.workspaces values ('${workspaceId}');
      insert into public.workspace_members values ('${workspaceId}', '${userId}');
    `);
    await db.query(
      `insert into public.audit_logs
        (workspace_id, actor_id, event_type, entity_type, entity_id, metadata, created_at)
       values
        ($1, $2, 'course_schedule_draft.upserted', 'course_schedule_draft', $3, $4::jsonb, '2026-09-19T00:00:00Z'),
        ($1, $2, 'course_schedule_draft.upserted', 'course_schedule_draft', $3, $5::jsonb, '2026-09-20T00:00:00Z'),
        ($1, $2, 'course_schedule_draft.upserted', 'course_schedule_draft', $6, $7::jsonb, '2026-09-19T00:00:00Z'),
        ($1, $2, 'course_schedule_draft.deleted', 'course_schedule_draft', $6, '{}'::jsonb, '2026-09-20T00:00:00Z')`,
      [
        workspaceId,
        userId,
        draftId,
        JSON.stringify({
          instructorName: "김강사",
          topic: "첫 강의",
          courseSize: "large",
          colorIndex: 1,
          scheduledDate: null,
        }),
        JSON.stringify({
          instructorName: "김강사",
          topic: "수정한 강의",
          memo: "정규 강의로 이전할 메모",
          courseSize: "small",
          colorIndex: 2,
          scheduledDate: "2026-10-08",
        }),
        deletedDraftId,
        JSON.stringify({
          instructorName: "삭제 강사",
          topic: "삭제 강의",
          courseSize: "large",
          colorIndex: 3,
        }),
      ],
    );

    await db.exec(
      await readFile(
        "supabase/migrations/202609210001_course_schedule_drafts.sql",
        "utf8",
      ),
    );

    const drafts = await db.query<{
      id: string;
      instructor_name: string;
      topic: string;
      memo: string;
      course_size: string;
      color_index: number;
      scheduled_date: Date;
    }>("select * from public.course_schedule_drafts");
    assert.equal(drafts.rows.length, 1);
    assert.equal(drafts.rows[0].id, draftId);
    assert.equal(drafts.rows[0].instructor_name, "김강사");
    assert.equal(drafts.rows[0].topic, "수정한 강의");
    assert.equal(drafts.rows[0].memo, "정규 강의로 이전할 메모");
    assert.equal(drafts.rows[0].course_size, "small");
    assert.equal(Number(drafts.rows[0].color_index), 2);
    assert.equal(drafts.rows[0].scheduled_date.toISOString().slice(0, 10), "2026-10-08");

    await assert.rejects(
      db.query(
        `insert into public.course_schedule_drafts
          (workspace_id, instructor_name, topic, memo, course_size, color_index, created_by)
         values ($1, '강사', '주제', '', 'invalid', 0, $2)`,
        [workspaceId, userId],
      ),
      /course_schedule_drafts_course_size_check/,
    );
  } finally {
    await db.close();
  }
});
