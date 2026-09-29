create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null,
  instructor_name text not null,
  free_webinar_at timestamptz not null,
  starts_at timestamptz not null,
  early_bird_event text not null default '',
  first_50_event text not null default '',
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_options (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  name text not null,
  list_price bigint not null check (list_price >= 0),
  sale_price bigint not null check (sale_price >= 0 and sale_price <= list_price),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.course_youtube_appearances (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  channel_name text not null,
  channel_url text not null,
  video_url text not null default '',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.course_jobs
  add column if not exists course_id uuid references public.courses on delete set null;

alter table public.message_studio_projects
  add column if not exists course_id uuid references public.courses on delete set null;

create index if not exists courses_workspace_updated_idx
  on public.courses (workspace_id, updated_at desc);
create index if not exists course_options_course_sort_idx
  on public.course_options (course_id, sort_order);
create index if not exists course_youtube_appearances_course_sort_idx
  on public.course_youtube_appearances (course_id, sort_order);
create index if not exists course_jobs_course_id_idx
  on public.course_jobs (course_id) where course_id is not null;
create index if not exists message_studio_projects_course_id_idx
  on public.message_studio_projects (course_id) where course_id is not null;

alter table public.courses enable row level security;
alter table public.course_options enable row level security;
alter table public.course_youtube_appearances enable row level security;

create policy "members manage courses"
  on public.courses for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

create policy "members manage course options"
  on public.course_options for all to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.is_workspace_member(c.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.is_workspace_member(c.workspace_id)
    )
  );

create policy "members manage course youtube appearances"
  on public.course_youtube_appearances for all to authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.is_workspace_member(c.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.courses c
      where c.id = course_id and public.is_workspace_member(c.workspace_id)
    )
  );

insert into public.services (
  service_key, title, description, icon, route, status, display_order
) values (
  'course-operations',
  '강의 운영 자동화',
  '강의를 기준으로 일정, 옵션, 수강생 명단, 문자 제작물과 유튜브 출연 정보를 연결합니다.',
  'book-open-check',
  '/services/course-operations',
  'active',
  5
)
on conflict (service_key) do update set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  route = excluded.route,
  status = excluded.status,
  display_order = excluded.display_order;

