create table if not exists public.message_studio_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  course_name text not null,
  instructor_name text not null default '',
  course_features text not null default '',
  target_audience text not null default '',
  payment_link text not null default '',
  inquiry_link text not null default '',
  curriculum_link text not null default '',
  replay_link text not null default '',
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_studio_resources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.message_studio_projects on delete cascade,
  position smallint not null check (position between 1 and 30),
  example_text text not null default '',
  generated_text text not null default '',
  generation_count integer not null default 0,
  generated_model text,
  generated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (project_id, position)
);

create index if not exists message_studio_projects_workspace_updated_idx
  on public.message_studio_projects (workspace_id, updated_at desc);
create index if not exists message_studio_resources_project_position_idx
  on public.message_studio_resources (project_id, position);

alter table public.message_studio_projects enable row level security;
alter table public.message_studio_resources enable row level security;

create policy "members manage message studio projects"
  on public.message_studio_projects for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

create policy "members manage message studio resources"
  on public.message_studio_resources for all to authenticated
  using (
    exists (
      select 1 from public.message_studio_projects p
      where p.id = project_id and public.is_workspace_member(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.message_studio_projects p
      where p.id = project_id and public.is_workspace_member(p.workspace_id)
    )
  );

insert into public.services (
  service_key, title, description, icon, route, status, display_order
) values (
  'message-studio',
  '문자 생성·제작 프로그램',
  '30개의 예시 문자를 바탕으로 강의별 신규 문자 30개를 AI로 제작합니다.',
  'sparkles',
  '/services/message-studio',
  'active',
  30
)
on conflict (service_key) do update set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  route = excluded.route,
  status = excluded.status,
  display_order = excluded.display_order;
