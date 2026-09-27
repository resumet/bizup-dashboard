import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("recent 30 engagement migration backfills legacy channels without changing new analyses", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.youtube_analyzed_channels (
        workspace_id uuid not null,
        channel_id text not null,
        metrics jsonb not null,
        primary key (workspace_id, channel_id)
      );
      create table public.youtube_channel_videos (
        workspace_id uuid not null,
        channel_id text not null,
        video_id text not null,
        published_at timestamptz not null,
        data jsonb not null
      );
      insert into public.youtube_analyzed_channels values
        ('00000000-0000-0000-0000-000000000001', 'legacy', '{"count":35}'),
        ('00000000-0000-0000-0000-000000000001', 'empty', '{"count":0}'),
        ('00000000-0000-0000-0000-000000000001', 'fresh', '{"count":1,"recent30Likes":99,"recent30Comments":98,"recent30Count":1}');
      insert into public.youtube_channel_videos
      select
        '00000000-0000-0000-0000-000000000001'::uuid,
        'legacy',
        lpad(n::text, 3, '0'),
        '2026-01-01'::timestamptz + n * interval '1 day',
        jsonb_build_object(
          'likes', case when n = 11 then null else n - 1 end,
          'comments', case when n = 21 then null else 2 * (n - 1) end
        )
      from generate_series(1, 35) n;
    `);
    const migration = await readFile("supabase/migrations/202609270007_youtube_recent30_engagement_backfill.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const result = await db.query<{ channel_id: string; metrics: Record<string, number | null> }>(
      "select channel_id, metrics from public.youtube_analyzed_channels order by channel_id",
    );
    const rows = Object.fromEntries(result.rows.map(row => [row.channel_id, row.metrics]));
    assert.deepEqual(rows.empty, { count: 0, recent30Likes: null, recent30Comments: null, recent30Count: 0 });
    assert.equal(rows.legacy.count, 35);
    assert.equal(rows.legacy.recent30Count, 30);
    assert.equal(rows.legacy.recent30Likes, (585 - 10) / 29);
    assert.equal(rows.legacy.recent30Comments, (1170 - 40) / 29);
    assert.deepEqual(rows.fresh, { count: 1, recent30Likes: 99, recent30Comments: 98, recent30Count: 1 });
  } finally {
    await db.close();
  }
});
