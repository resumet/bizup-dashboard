import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("워크스페이스별 유튜브 촬영 알림 기준의 기본값과 허용 범위를 DB에서 보장한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.workspaces (
        id uuid primary key,
        name text not null
      );
    `);
    await db.exec(await readFile(
      "supabase/migrations/20261102095859_add_youtube_filming_alert_weeks.sql",
      "utf8",
    ));
    await db.exec("insert into public.workspaces(id, name) values ('00000000-0000-0000-0000-000000000001', 'test')");

    const defaults = await db.query<{ youtube_filming_alert_weeks: number }>(
      "select youtube_filming_alert_weeks from public.workspaces where id = '00000000-0000-0000-0000-000000000001'",
    );
    assert.equal(defaults.rows[0]?.youtube_filming_alert_weeks, 4);

    for (const weeks of [3, 4, 5, 6]) {
      await db.exec(`update public.workspaces set youtube_filming_alert_weeks = ${weeks}`);
    }
    await assert.rejects(
      db.exec("update public.workspaces set youtube_filming_alert_weeks = 2"),
      /workspaces_youtube_filming_alert_weeks_check/u,
    );
    await assert.rejects(
      db.exec("update public.workspaces set youtube_filming_alert_weeks = 7"),
      /workspaces_youtube_filming_alert_weeks_check/u,
    );
  } finally {
    await db.close();
  }
});
