import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("기존 커스텀 교안 링크를 새 교안(캔바) 링크로 복제한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.courses (
        id text primary key,
        custom_links jsonb not null default '[]'::jsonb
      );

      insert into public.courses (id, custom_links) values
        ('with-material', '[{"name":"강의 교안","url":"https://www.canva.com/design/first"},{"name":"교안 백업","url":"https://www.canva.com/design/second"}]'::jsonb),
        ('without-material', '[{"name":"강사 사진","url":"https://example.com/photos"}]'::jsonb),
        ('empty-material', '[{"name":"교안","url":""}]'::jsonb);
    `);

    await db.exec(await readFile(
      "supabase/migrations/20261028070738_add_course_canva_link.sql",
      "utf8",
    ));

    const result = await db.query<{
      id: string;
      course_canva_link: string;
      custom_links: Array<{ name: string; url: string }>;
    }>(
      "select id, course_canva_link, custom_links from public.courses order by id",
    );
    assert.equal(result.rows[0]?.course_canva_link, "");
    assert.equal(
      result.rows[1]?.course_canva_link,
      "https://www.canva.com/design/first",
    );
    assert.deepEqual(result.rows[1]?.custom_links, [
      { name: "강의 교안", url: "https://www.canva.com/design/first" },
      { name: "교안 백업", url: "https://www.canva.com/design/second" },
    ]);
    assert.equal(result.rows[2]?.course_canva_link, "");
  } finally {
    await db.close();
  }
});
