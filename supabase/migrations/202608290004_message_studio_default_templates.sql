create table if not exists public.message_studio_default_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  position smallint not null check (position between 1 and 30),
  content text not null default '',
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, position)
);

create index if not exists message_studio_default_templates_workspace_position_idx
  on public.message_studio_default_templates (workspace_id, position);

alter table public.message_studio_default_templates enable row level security;

drop policy if exists "members manage message studio default templates"
  on public.message_studio_default_templates;
create policy "members manage message studio default templates"
  on public.message_studio_default_templates for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
  );
