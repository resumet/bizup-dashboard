create table if not exists public.cash_flow_settings (
  workspace_id uuid primary key references public.workspaces on delete cascade,
  current_bank_balance bigint not null default 0,
  monthly_fixed_expense bigint not null default 0 check (monthly_fixed_expense >= 0),
  updated_by uuid not null references auth.users,
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_flow_course_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  expected_month date not null,
  nova_inflow bigint not null default 0 check (nova_inflow >= 0),
  instructor_payout bigint not null default 0 check (instructor_payout >= 0),
  is_included boolean not null default true,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users,
  updated_at timestamptz not null default now(),
  unique (workspace_id, course_id),
  check (date_trunc('month', expected_month)::date = expected_month)
);

create index if not exists cash_flow_course_plans_workspace_month_idx
  on public.cash_flow_course_plans (workspace_id, expected_month, course_id);

alter table public.cash_flow_settings enable row level security;
alter table public.cash_flow_course_plans enable row level security;

drop policy if exists "members manage cash flow settings" on public.cash_flow_settings;
create policy "members manage cash flow settings"
  on public.cash_flow_settings for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id) and updated_by = auth.uid());

drop policy if exists "members manage cash flow course plans" on public.cash_flow_course_plans;
create policy "members manage cash flow course plans"
  on public.cash_flow_course_plans for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and updated_by = auth.uid()
    and exists (
      select 1 from public.courses c
      where c.id = course_id and c.workspace_id = cash_flow_course_plans.workspace_id
    )
  );

insert into public.services (
  service_key, title, description, icon, route, status, display_order
) values (
  'cash-flow',
  '자금 흐름',
  '현재 통장 잔액과 강의별 입출금, 월 고정지출을 반영해 향후 자금 잔액을 예측합니다.',
  'wallet-cards',
  '/services/cash-flow',
  'active',
  6
)
on conflict (service_key) do update set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  route = excluded.route,
  status = excluded.status,
  display_order = excluded.display_order;

notify pgrst, 'reload schema';
