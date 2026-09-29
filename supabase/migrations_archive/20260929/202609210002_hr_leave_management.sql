create table public.hr_leave_profiles (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  employment_start_date date not null,
  created_by uuid not null references auth.users,
  updated_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.hr_annual_leave_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  grant_year integer not null check (grant_year between 2000 and 2100),
  granted_days numeric(4,1) not null check (granted_days between 0 and 12),
  employment_start_date date not null,
  granted_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, grant_year)
);

create table public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  leave_date date not null,
  unit text not null check (unit in ('full', 'am', 'pm')),
  days numeric(2,1) generated always as (case when unit = 'full' then 1.0 else 0.5 end) stored,
  reason text not null default '' check (length(reason) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  review_note text not null default '' check (length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.hr_leave_support_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  support_date date not null,
  support_type text not null check (support_type in ('night_webinar', 'weekend_holiday')),
  unit text not null check (unit in ('half', 'full')),
  earned_days numeric(2,1) generated always as (
    case
      when support_type = 'night_webinar' then 0.5
      when unit = 'full' then 1.0
      else 0.5
    end
  ) stored,
  note text not null default '' check (length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  review_note text not null default '' check (length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (support_type <> 'night_webinar' or unit = 'half')
);

create index hr_leave_requests_workspace_date_idx
  on public.hr_leave_requests(workspace_id, leave_date, status);
create index hr_leave_requests_user_date_idx
  on public.hr_leave_requests(workspace_id, user_id, leave_date desc);
create index hr_leave_support_workspace_date_idx
  on public.hr_leave_support_records(workspace_id, support_date, status);
create index hr_leave_support_user_date_idx
  on public.hr_leave_support_records(workspace_id, user_id, support_date desc);

create or replace function public.touch_hr_leave_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger hr_leave_profiles_touch_updated_at
before update on public.hr_leave_profiles
for each row execute function public.touch_hr_leave_updated_at();
create trigger hr_annual_leave_grants_touch_updated_at
before update on public.hr_annual_leave_grants
for each row execute function public.touch_hr_leave_updated_at();
create trigger hr_leave_requests_touch_updated_at
before update on public.hr_leave_requests
for each row execute function public.touch_hr_leave_updated_at();
create trigger hr_leave_support_touch_updated_at
before update on public.hr_leave_support_records
for each row execute function public.touch_hr_leave_updated_at();

alter table public.hr_leave_profiles enable row level security;
alter table public.hr_annual_leave_grants enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.hr_leave_support_records enable row level security;

create policy hr_leave_profiles_member_read on public.hr_leave_profiles
for select to authenticated using (
  public.is_workspace_member(workspace_id)
  and (user_id = auth.uid() or exists (
    select 1 from public.workspace_members member
    where member.workspace_id = hr_leave_profiles.workspace_id
      and member.user_id = auth.uid()
      and member.role in ('admin', 'super_admin')
  ))
);
create policy hr_annual_leave_grants_member_read on public.hr_annual_leave_grants
for select to authenticated using (
  public.is_workspace_member(workspace_id)
  and (user_id = auth.uid() or exists (
    select 1 from public.workspace_members member
    where member.workspace_id = hr_annual_leave_grants.workspace_id
      and member.user_id = auth.uid()
      and member.role in ('admin', 'super_admin')
  ))
);
create policy hr_leave_requests_member_read on public.hr_leave_requests
for select to authenticated using (
  public.is_workspace_member(workspace_id)
  and (user_id = auth.uid() or exists (
    select 1 from public.workspace_members member
    where member.workspace_id = hr_leave_requests.workspace_id
      and member.user_id = auth.uid()
      and member.role in ('admin', 'super_admin')
  ))
);
create policy hr_leave_support_member_read on public.hr_leave_support_records
for select to authenticated using (
  public.is_workspace_member(workspace_id)
  and (user_id = auth.uid() or exists (
    select 1 from public.workspace_members member
    where member.workspace_id = hr_leave_support_records.workspace_id
      and member.user_id = auth.uid()
      and member.role in ('admin', 'super_admin')
  ))
);

grant select on public.hr_leave_profiles, public.hr_annual_leave_grants,
  public.hr_leave_requests, public.hr_leave_support_records to authenticated;
grant all on public.hr_leave_profiles, public.hr_annual_leave_grants,
  public.hr_leave_requests, public.hr_leave_support_records to service_role;
revoke all on function public.touch_hr_leave_updated_at() from public, anon, authenticated;
grant execute on function public.touch_hr_leave_updated_at() to service_role;
