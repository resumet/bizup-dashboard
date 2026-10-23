import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261023061647_backfill_instagram_external_dm_links.sql"),
  "utf8",
);

test("기존 공개 외부 작성 문서 링크만 빈 DM 자료에 채운다", async () => {
  const db = new PGlite();
  await db.exec(`
    create table public.course_documents (
      id uuid primary key,
      slug text not null,
      status text not null,
      deleted_at timestamptz
    );
    create table public.course_instagram_materials (
      document_id uuid references public.course_documents(id),
      dm_material text not null default '',
      updated_at timestamptz not null default now()
    );
    insert into public.course_documents (id, slug, status) values
      ('00000000-0000-4000-8000-000000000001', 'published-guide', 'published'),
      ('00000000-0000-4000-8000-000000000002', 'draft-guide', 'draft');
    insert into public.course_instagram_materials (document_id, dm_material) values
      ('00000000-0000-4000-8000-000000000001', ''),
      ('00000000-0000-4000-8000-000000000001', '수동 자료'),
      ('00000000-0000-4000-8000-000000000002', '');
  `);

  await db.exec(migration);

  const result = await db.query<{ dm_material: string }>(
    "select dm_material from public.course_instagram_materials order by dm_material",
  );
  assert.deepEqual(result.rows.map((row) => row.dm_material), ["", "/article/published-guide", "수동 자료"]);
  await db.close();
});
