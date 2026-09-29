create table if not exists public.course_instagram_materials (
  course_id uuid not null references public.courses on delete cascade,
  position smallint not null check (position between 1 and 40),
  title text not null default '' check (char_length(title) <= 200),
  notion_url text not null default '' check (char_length(notion_url) <= 2048),
  updated_at timestamptz not null default now(),
  primary key (course_id, position)
);

create table if not exists public.course_instagram_shares (
  course_id uuid primary key references public.courses on delete cascade,
  public_id uuid not null unique default gen_random_uuid(),
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.course_instagram_materials enable row level security;
alter table public.course_instagram_shares enable row level security;

create policy "members manage course instagram materials"
  on public.course_instagram_materials for all to authenticated
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

create policy "members manage course instagram shares"
  on public.course_instagram_shares for all to authenticated
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

notify pgrst, 'reload schema';
