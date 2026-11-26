create table public.course_replay_guides (
  course_id uuid primary key references public.courses(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  revision integer not null check (revision > 0),
  draft jsonb not null,
  published jsonb,
  has_publication boolean generated always as (published is not null) stored,
  public_enabled boolean not null default false,
  short_url text,
  check (not public_enabled or published is not null)
);
alter table public.course_replay_guides enable row level security;
revoke all on public.course_replay_guides from public, anon, authenticated;
grant select, insert, update on public.course_replay_guides to service_role;
