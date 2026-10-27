import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("기존 강의에 웨비나 정보 기본값과 길이 제한을 추가한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.courses (
        id uuid primary key
      );
      insert into public.courses(id)
      values ('00000000-0000-4000-8000-000000000001');
    `);
    await db.exec(await readFile(
      "supabase/migrations/20261027005105_add_course_webinar_information.sql",
      "utf8",
    ));

    const row = (await db.query<{
      webinar_youtube_title: string;
      webinar_youtube_description: string;
      webinar_command_deck_url: string;
    }>("select webinar_youtube_title, webinar_youtube_description, webinar_command_deck_url from public.courses")).rows[0];
    assert.equal(row.webinar_youtube_title, "");
    assert.equal(row.webinar_youtube_description, "");
    assert.match(row.webinar_command_deck_url, /docs\.google\.com\/presentation/u);

    await assert.rejects(() => db.query(
      "update public.courses set webinar_youtube_title = $1",
      ["가".repeat(201)],
    ));
  } finally {
    await db.close();
  }
});
