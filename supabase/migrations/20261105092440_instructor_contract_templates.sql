create table if not exists public.instructor_contract_templates (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  template jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.instructor_contract_templates enable row level security;

revoke all on table public.instructor_contract_templates from anon, authenticated;

comment on table public.instructor_contract_templates is
  'Shared instructor contract templates. Access is mediated by authenticated server routes.';
