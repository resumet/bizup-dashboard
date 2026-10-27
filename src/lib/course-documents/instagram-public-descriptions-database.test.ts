import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261027093613_add_instagram_material_public_descriptions.sql"),
  "utf8",
);

test("인스타 자료에 공개용 DM 자료 설명과 부가설명을 안전하게 추가한다", async () => {
  const db = new PGlite();
  await db.exec(`
    create table public.course_instagram_materials (
      course_id uuid not null,
      position smallint not null,
      primary key (course_id, position)
    );
  `);

  await db.exec(migration);
  const courseId = "00000000-0000-4000-8000-000000000001";
  await db.query(
    "insert into public.course_instagram_materials (course_id, position) values ($1, 1)",
    [courseId],
  );

  const defaults = await db.query<{ dm_material_description: string; additional_description: string }>(
    "select dm_material_description, additional_description from public.course_instagram_materials where course_id = $1",
    [courseId],
  );
  assert.deepEqual(defaults.rows[0], { dm_material_description: "", additional_description: "" });

  await assert.rejects(
    db.query(
      "update public.course_instagram_materials set dm_material_description = $1 where course_id = $2",
      ["가".repeat(5001), courseId],
    ),
  );
  await db.close();
});
