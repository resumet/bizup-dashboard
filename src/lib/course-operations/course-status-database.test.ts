import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("기존 강의 상태를 웨비나 D+3 기준으로 백필하고 네 상태만 저장한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.courses (
        id uuid primary key,
        free_webinar_at timestamptz not null
      );
      insert into public.courses(id, free_webinar_at)
      values
        ('00000000-0000-4000-8000-000000000001', current_timestamp - interval '10 days'),
        ('00000000-0000-4000-8000-000000000002', current_timestamp + interval '10 days');
    `);
    await db.exec(
      await readFile(
        "supabase/migrations/20261006024440_course_status.sql",
        "utf8",
      ),
    );

    const rows = (
      await db.query<{ id: string; status: string }>(
        "select id, status from public.courses order by id",
      )
    ).rows;
    assert.deepEqual(rows.map(({ status }) => status), ["completed", "ongoing"]);

    await db.exec(`
      insert into public.courses(id, free_webinar_at)
      values ('00000000-0000-4000-8000-000000000003', current_timestamp);
      update public.courses
      set status = 'on_hold'
      where id = '00000000-0000-4000-8000-000000000003';
    `);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from public.courses where id = '00000000-0000-4000-8000-000000000003'",
        )
      ).rows[0]?.status,
      "on_hold",
    );
    await assert.rejects(() =>
      db.exec(
        "update public.courses set status = 'invalid' where id = '00000000-0000-4000-8000-000000000003'",
      ),
    );
  } finally {
    await db.close();
  }
});
