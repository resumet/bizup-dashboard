create table if not exists public.settlement_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  original_filename text not null default '',
  row_count integer not null check (row_count > 0),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists settlement_reports_workspace_updated_idx
  on public.settlement_reports (workspace_id, updated_at desc);

alter table public.settlement_reports enable row level security;

create policy "members manage settlement reports"
  on public.settlement_reports for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
  );
