import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("PDF 작업은 비공개이며 중복 claim·만료 lease·실패 재시도가 안전하다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema storage;
      create table public.workspaces(id uuid primary key);
      create table public.courses(id uuid primary key);
      create table public.course_documents(id uuid primary key);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    `);
    const file = readdirSync("supabase/migrations").find((name) => name.endsWith("_course_document_pdf_imports.sql"))!;
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    const id = "00000000-0000-4000-8000-000000000001";
    for (const table of ["workspaces", "courses", "course_documents"]) await db.query(`insert into public.${table} values ($1)`, [id]);
    await db.query(`insert into public.course_document_pdf_imports(document_id,course_id,workspace_id,file_name,file_size,sha256,source_path,status) values($1,$1,$1,'a.pdf',10,repeat('a',64),'source.pdf','queued')`, [id]);
    const first = await db.query<{ id: string; lease_token: string }>("select * from public.claim_course_document_pdf_import()");
    assert.equal(first.rows.length, 1);
    assert.equal((await db.query("select * from public.claim_course_document_pdf_import()")).rows.length, 0);
    await db.exec("update public.course_document_pdf_imports set updated_at=now()-interval '11 minutes'");
    const second = await db.query<{ lease_token: string }>("select * from public.claim_course_document_pdf_import()");
    assert.notEqual(first.rows[0].lease_token, second.rows[0].lease_token);
    assert.equal((await db.query("update public.course_document_pdf_imports set status='completed' where lease_token=$1 returning id", [first.rows[0].lease_token])).rows.length, 0);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from public.course_document_pdf_imports"));
    await assert.rejects(db.query("select * from public.claim_course_document_pdf_import()"));
    await db.exec("reset role");
    assert.equal((await db.query<{ public: boolean }>("select public from storage.buckets")).rows[0].public, false);
    assert.equal((await db.query<{ relrowsecurity: boolean }>("select relrowsecurity from pg_class where relname='course_document_pdf_imports'")).rows[0].relrowsecurity, true);
    await db.exec("update public.course_document_pdf_imports set attempts=3,updated_at=now()-interval '11 minutes'");
    await db.query("select * from public.claim_course_document_pdf_import()");
    assert.equal((await db.query<{ status: string }>("select status from public.course_document_pdf_imports")).rows[0].status, "failed");
  } finally { await db.close(); }
});
