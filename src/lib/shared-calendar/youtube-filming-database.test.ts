import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const W1 = "00000000-0000-4000-8000-000000000001";
const C1 = "00000000-0000-4000-8000-000000000011";
const A1 = "00000000-0000-4000-8000-000000000021";
const A2 = "00000000-0000-4000-8000-000000000022";

test("유튜브 촬영 확정일을 공용캘린더에 자동 동기화한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema calendar_private;
      create schema course_media_private;

      create table public.workspaces(id uuid primary key);
      create table public.courses(
        id uuid primary key,
        workspace_id uuid not null references public.workspaces(id),
        instructor_name text not null
      );
      create table public.course_youtube_appearances(
        id uuid primary key,
        course_id uuid not null references public.courses(id) on delete cascade,
        channel_name text not null,
        request_status text not null,
        filming_confirmed boolean not null default false,
        filming_date date
      );
      create table public.shared_calendar_meeting_types(
        id uuid primary key default gen_random_uuid(),
        workspace_id uuid not null references public.workspaces(id) on delete cascade,
        name text not null,
        code text constraint shared_calendar_meeting_types_code_check
          check (code in ('instructor_zoom', 'rehearsal', 'webinar', 'weekly_meeting')),
        unique (id, workspace_id),
        unique (workspace_id, code)
      );
      create unique index shared_calendar_type_name_idx
        on public.shared_calendar_meeting_types(workspace_id, lower(name));
      create table public.shared_calendar_events(
        id uuid primary key default gen_random_uuid(),
        workspace_id uuid not null references public.workspaces(id) on delete cascade,
        title text not null check (title = btrim(title) and char_length(title) between 1 and 120),
        event_date date not null,
        start_minutes integer not null,
        duration_minutes integer not null,
        meeting_type_id uuid not null,
        course_id uuid references public.courses(id) on delete set null,
        notes text not null default '',
        participant_ids uuid[] not null default '{}',
        location_kind text not null default 'tbd',
        location_text text not null default '',
        time_tbd boolean not null default false,
        created_by uuid,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        version integer not null default 1,
        foreign key (meeting_type_id, workspace_id)
          references public.shared_calendar_meeting_types(id, workspace_id)
      );

      create function calendar_private.guard_event()
      returns trigger language plpgsql set search_path = '' as $$
      begin
        if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
        return new;
      end;
      $$;
      create trigger shared_calendar_guard_event
        before insert or update on public.shared_calendar_events
        for each row execute function calendar_private.guard_event();

      insert into public.workspaces values ('${W1}');
      insert into public.courses values ('${C1}', '${W1}', '김강사');
      insert into public.shared_calendar_meeting_types(workspace_id, name, code)
      values
        ('${W1}', '강사 줌미팅', 'instructor_zoom'),
        ('${W1}', '리허설', 'rehearsal'),
        ('${W1}', '웨비나', 'webinar'),
        ('${W1}', '주간회의', 'weekly_meeting');
      insert into public.course_youtube_appearances
        (id, course_id, channel_name, request_status, filming_confirmed, filming_date)
      values ('${A1}', '${C1}', '성장채널', 'confirmed', true, '2026-11-10');
    `);

    await db.exec(await readFile("supabase/migrations/20261023052823_youtube_filming_shared_calendar.sql", "utf8"));

    const backfilled = (await db.query<{
      id: string;
      title: string;
      event_date: string;
      code: string;
      course_id: string;
      time_tbd: boolean;
    }>(`
      select e.id, e.title, e.event_date::text, t.code, e.course_id, e.time_tbd
      from shared_calendar_events e
      join shared_calendar_meeting_types t on t.id = e.meeting_type_id
      where e.youtube_appearance_id = $1
    `, [A1])).rows[0];
    assert.deepEqual(backfilled, {
      id: backfilled.id,
      title: "김강사-성장채널-촬영",
      event_date: "2026-11-10",
      code: "youtube_filming",
      course_id: C1,
      time_tbd: true,
    });

    await db.exec(`
      insert into public.course_youtube_appearances
        (id, course_id, channel_name, request_status, filming_confirmed, filming_date)
      values ('${A2}', '${C1}', '비즈채널', 'confirmed', true, '2026-11-20');
    `);
    assert.equal((await db.query("select * from shared_calendar_events")).rows.length, 2);

    await db.exec(`
      update public.course_youtube_appearances
      set channel_name = '새채널', filming_date = '2026-11-21'
      where id = '${A2}';
    `);
    const updated = (await db.query<{ id: string; title: string; event_date: string }>(`
      select id, title, event_date::text from shared_calendar_events
      where youtube_appearance_id = $1
    `, [A2])).rows[0];
    assert.equal(updated.title, "김강사-새채널-촬영");
    assert.equal(updated.event_date, "2026-11-21");

    await db.exec(`update public.courses set instructor_name = '이강사' where id = '${C1}'`);
    const renamed = (await db.query<{ title: string }>(`
      select title from shared_calendar_events where youtube_appearance_id = $1
    `, [A2])).rows[0];
    assert.equal(renamed.title, "이강사-새채널-촬영");

    await db.exec(`update public.course_youtube_appearances set filming_confirmed = false where id = '${A2}'`);
    assert.equal((await db.query("select * from shared_calendar_events where youtube_appearance_id = $1", [A2])).rows.length, 0);

    await db.exec(`update public.course_youtube_appearances set filming_confirmed = true where id = '${A2}'`);
    assert.equal((await db.query("select * from shared_calendar_events where youtube_appearance_id = $1", [A2])).rows.length, 1);

    await db.exec(`delete from public.course_youtube_appearances where id = '${A2}'`);
    assert.equal((await db.query("select * from shared_calendar_events where youtube_appearance_id = $1", [A2])).rows.length, 0);
  } finally {
    await db.close();
  }
});
