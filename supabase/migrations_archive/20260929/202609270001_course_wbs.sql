-- Keep the workspace and course association enforceable even for service-role writes.
create unique index if not exists courses_id_workspace_unique_idx
  on public.courses (id, workspace_id);

create table if not exists public.course_wbs (
  course_id uuid primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (course_id, workspace_id)
    references public.courses (id, workspace_id) on delete cascade
);

create index if not exists course_wbs_workspace_idx
  on public.course_wbs (workspace_id, updated_at desc);

create table if not exists public.course_wbs_templates (
  workspace_id uuid not null references public.workspaces on delete cascade,
  id text not null check (char_length(id) between 1 and 120),
  name text not null check (char_length(name) between 1 and 120),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  updated_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists course_wbs_templates_workspace_updated_idx
  on public.course_wbs_templates (workspace_id, updated_at desc);

alter table public.course_wbs enable row level security;
alter table public.course_wbs_templates enable row level security;

create policy "members manage course wbs"
  on public.course_wbs for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "members manage course wbs templates"
  on public.course_wbs_templates for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create or replace function public.touch_course_wbs_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_course_wbs_updated_at on public.course_wbs;
create trigger touch_course_wbs_updated_at
  before update on public.course_wbs
  for each row execute function public.touch_course_wbs_updated_at();

drop trigger if exists touch_course_wbs_template_updated_at on public.course_wbs_templates;
create trigger touch_course_wbs_template_updated_at
  before update on public.course_wbs_templates
  for each row execute function public.touch_course_wbs_updated_at();
