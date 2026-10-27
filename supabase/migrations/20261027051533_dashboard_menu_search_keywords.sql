create table public.dashboard_menu_search_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  keywords jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint dashboard_menu_search_settings_keywords_object_check
    check (jsonb_typeof(keywords) = 'object')
);

comment on table public.dashboard_menu_search_settings is
  '워크스페이스별 대시보드 메뉴 추가 검색어 설정';

alter table public.dashboard_menu_search_settings enable row level security;
revoke all on table public.dashboard_menu_search_settings from public, anon, authenticated;
grant select, insert, update, delete on table public.dashboard_menu_search_settings to service_role;

create policy "service role manages dashboard menu search settings"
on public.dashboard_menu_search_settings
for all
to service_role
using (true)
with check (true);
