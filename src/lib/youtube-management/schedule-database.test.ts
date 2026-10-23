import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

test("유튜브 촬영일과 업로드일을 날짜로 저장하고 출연 확정 상태에서만 유지한다", async () => {
  const db = new PGlite();
  const courseId = "00000000-0000-4000-8000-000000000071";
  const appearanceId = "00000000-0000-4000-8000-000000000072";
  const workspaceId = "00000000-0000-4000-8000-000000000073";
  const token = "b".repeat(48);

  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create role service_role;
      create schema course_media_private;
      create table public.courses (
        id uuid primary key,
        name text not null,
        instructor_name text not null
      );
      create table public.course_youtube_settings (
        course_id uuid primary key,
        workspace_id uuid not null,
        public_enabled boolean not null default false,
        public_token text not null unique,
        brief_enabled boolean not null default false,
        brief_token text not null unique,
        brief jsonb not null default '{}'::jsonb,
        brief_revision integer not null default 0,
        updated_at timestamptz not null default now()
      );
      create table public.course_youtube_appearances (
        id uuid primary key,
        course_id uuid not null,
        channel_name text not null,
        video_url text not null default '',
        request_status text not null,
        filming_at timestamptz,
        filming_confirmed boolean not null default false,
        is_internal boolean not null default false,
        note text not null default '',
        respondent text not null default '',
        revision integer not null default 0,
        updated_at timestamptz not null default now(),
        constraint youtube_confirmed_filming_requires_date check (not filming_confirmed or filming_at is not null)
      );
      create table public.media_notifications (
        workspace_id uuid not null,
        course_id uuid not null,
        kind text not null,
        title text not null,
        message text not null,
        href text not null
      );
    `);
    await db.query("insert into public.courses(id,name,instructor_name) values($1,'테스트 강의','테스트 강사')", [courseId]);
    await db.query(
      "insert into public.course_youtube_settings(course_id,workspace_id,public_enabled,public_token,brief_token) values($1,$2,true,$3,$4)",
      [courseId, workspaceId, token, "c".repeat(48)],
    );
    await db.query(
      "insert into public.course_youtube_appearances(id,course_id,channel_name,request_status,filming_at,filming_confirmed) values($1,$2,'테스트 채널','confirmed','2026-11-03 15:30+09',true)",
      [appearanceId, courseId],
    );

    await db.exec(await readFile("supabase/migrations/20261023051340_youtube_filming_upload_dates.sql", "utf8"));

    const backfilled = (await db.query<{ filming_date: string; upload_date: string | null }>(
      "select filming_date::text,upload_date::text from public.course_youtube_appearances where id=$1",
      [appearanceId],
    )).rows[0];
    assert.deepEqual(backfilled, { filming_date: "2026-11-03", upload_date: null });

    const updated = (await db.query<{ result: { filming_date: string; upload_date: string; revision: number } }>(
      `select public.update_public_youtube_media($1,'schedule',$2::jsonb) as result`,
      [token, JSON.stringify({
        id: appearanceId,
        revision: 0,
        request_status: "confirmed",
        filming_date: "2026-11-05",
        upload_date: "2026-11-12",
        filming_confirmed: true,
        note: "일정 확정",
        respondent: "담당자",
      })],
    )).rows[0].result;
    assert.deepEqual(updated, {
      id: appearanceId,
      revision: 1,
      video_url: "",
      request_status: "confirmed",
      filming_date: "2026-11-05",
      upload_date: "2026-11-12",
      filming_confirmed: true,
      note: "일정 확정",
      respondent: "담당자",
    });

    const stored = (await db.query<{ filming_date: string; upload_date: string; legacy_date: string }>(
      "select filming_date::text,upload_date::text,(filming_at at time zone 'Asia/Seoul')::date::text as legacy_date from public.course_youtube_appearances where id=$1",
      [appearanceId],
    )).rows[0];
    assert.deepEqual(stored, { filming_date: "2026-11-05", upload_date: "2026-11-12", legacy_date: "2026-11-05" });

    await db.query(
      "update public.course_youtube_appearances set request_status='declined',filming_confirmed=false,filming_at=null where id=$1",
      [appearanceId],
    );
    const declined = (await db.query<{ filming_date: string | null; upload_date: string | null; filming_confirmed: boolean }>(
      "select filming_date::text,upload_date::text,filming_confirmed from public.course_youtube_appearances where id=$1",
      [appearanceId],
    )).rows[0];
    assert.deepEqual(declined, { filming_date: null, upload_date: null, filming_confirmed: false });

    const privileges = (await db.query<{ anon: boolean; authenticated: boolean; service_role: boolean }>(`
      select
        has_function_privilege('anon','public.update_public_youtube_media(text,text,jsonb)','EXECUTE') as anon,
        has_function_privilege('authenticated','public.update_public_youtube_media(text,text,jsonb)','EXECUTE') as authenticated,
        has_function_privilege('service_role','public.update_public_youtube_media(text,text,jsonb)','EXECUTE') as service_role
    `)).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: false, service_role: true });
  } finally {
    await db.close();
  }
});
