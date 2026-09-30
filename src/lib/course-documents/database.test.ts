import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260930125741_course_document_leadgate.sql"),
  "utf8",
);

test("강의 문서·리드·차단번호를 보존 제약과 RLS로 생성한다", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema storage;
    create schema extensions;
    create function extensions.gen_random_bytes(size integer)
      returns bytea language sql immutable
      as 'select decode(repeat(''ab'', size), ''hex'')';
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
    create table public.courses (
      id uuid primary key,
      workspace_id uuid not null references public.workspaces(id)
    );
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
  `);
  await db.exec(migration);

  const workspaceId = "00000000-0000-4000-8000-000000000001";
  const courseId = "00000000-0000-4000-8000-000000000002";
  await db.query("insert into public.workspaces (id) values ($1)", [workspaceId]);
  await db.query("insert into public.courses (id, workspace_id) values ($1, $2)", [courseId, workspaceId]);
  await db.query("insert into public.course_document_settings (course_id, workspace_id) values ($1, $2)", [courseId, workspaceId]);

  const settings = await db.query<{ external_access_token: string }>("select external_access_token from public.course_document_settings");
  assert.equal(settings.rows[0]?.external_access_token.length, 48);

  const insertedDocument = await db.query<{ id: string }>(`
    insert into public.course_documents
      (workspace_id, course_id, instructor_name, title, slug, content)
    values ($1, $2, '강사', '문서', 'document-test', '[]')
    returning id
  `, [workspaceId, courseId]);
  const documentId = insertedDocument.rows[0]?.id;
  assert.ok(documentId);

  await db.query(`
    insert into public.course_document_leads
      (workspace_id, document_id, course_id, instructor_name, name, phone, phone_normalized)
    values ($1, $2, $3, '강사', '신청자', '010-1234-5678', '01012345678')
  `, [workspaceId, documentId, courseId]);
  await assert.rejects(db.query(`
    insert into public.course_document_leads
      (workspace_id, document_id, course_id, instructor_name, name, phone, phone_normalized)
    values ($1, $2, $3, '강사', '중복', '01012345678', '01012345678')
  `, [workspaceId, documentId, courseId]));
  await assert.rejects(db.query("delete from public.courses where id = $1", [courseId]));

  const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(`
    select relname, relrowsecurity
    from pg_class
    where relname in (
      'course_document_settings',
      'course_documents',
      'course_document_leads',
      'course_document_blocked_phones'
    )
    order by relname
  `);
  assert.equal(rls.rows.length, 4);
  assert.ok(rls.rows.every((row) => row.relrowsecurity));

  const bucket = await db.query<{ public: boolean; file_size_limit: number }>("select public, file_size_limit::int from storage.buckets where id = 'course-document-images'");
  assert.deepEqual(bucket.rows, [{ public: true, file_size_limit: 10_485_760 }]);
  await db.close();
});
