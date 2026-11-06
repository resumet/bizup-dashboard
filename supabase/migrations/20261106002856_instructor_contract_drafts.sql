create table if not exists public.instructor_contract_drafts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  values jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.instructor_contract_drafts enable row level security;

revoke all on table public.instructor_contract_drafts from anon, authenticated;

comment on table public.instructor_contract_drafts is
  'Private per-user instructor contract writing drafts. Access is mediated by authenticated server routes.';
