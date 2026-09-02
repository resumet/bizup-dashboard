create table if not exists public.course_live_videos (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  name text not null,
  video_url text not null,
  note text not null default '',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists course_live_videos_course_sort_idx
  on public.course_live_videos (course_id, sort_order);

alter table public.course_live_videos enable row level security;

drop policy if exists "members manage course live videos"
  on public.course_live_videos;
create policy "members manage course live videos"
  on public.course_live_videos
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.courses c
      where c.id = course_id
        and public.is_workspace_member(c.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.courses c
      where c.id = course_id
        and public.is_workspace_member(c.workspace_id)
    )
  );
