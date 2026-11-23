import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("자체 유튜브는 복수 출연을 저장하고 다른 워크스페이스 연결 및 사용 중 채널 삭제를 차단한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table workspaces(id uuid primary key);
      create table courses(id uuid primary key, workspace_id uuid references workspaces(id));
      insert into workspaces values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
      insert into courses values ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001');`);
    await db.exec(await readFile("supabase/migrations/20261123125931_internal_youtube.sql", "utf8"));
    await db.exec(`insert into internal_youtube_channels(id,workspace_id,name) values
      ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','A'),
      ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','B');`);
    const insert = `insert into internal_youtube_appearances(workspace_id,course_id,channel_id) values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004')`;
    await db.exec(insert); await db.exec(insert);
    assert.equal((await db.query<{count: number}>("select count(*)::int as count from internal_youtube_appearances")).rows[0].count, 2);
    await assert.rejects(db.exec(insert.replace(/000000000004/g, "000000000005")), /foreign key/);
    await assert.rejects(db.exec("delete from internal_youtube_channels where name='A'"), /foreign key/);
    assert.equal((await db.query<{allowed: boolean}>("select has_table_privilege('authenticated','internal_youtube_channels','SELECT') as allowed")).rows[0].allowed, false);
    await db.exec("delete from courses");
    assert.equal((await db.query<{count: number}>("select count(*)::int as count from internal_youtube_appearances")).rows[0].count, 0);
  } finally { await db.close(); }
});
