create table public.ad_creative_sources (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  spreadsheet_url text not null,
  rows jsonb not null default '[]'::jsonb check (jsonb_typeof(rows) = 'array'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index ad_creative_sources_updated_by_idx on public.ad_creative_sources(updated_by);
alter table public.ad_creative_sources enable row level security;
revoke all on public.ad_creative_sources from public, anon, authenticated;
grant select, insert, update, delete on public.ad_creative_sources to service_role;
create policy "service role manages creative sources" on public.ad_creative_sources
for all to service_role using (true) with check (true);
