create table public.instructor_contract_instructors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_contract_instructors_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint instructor_contract_instructors_address_check check (char_length(address) <= 500),
  constraint instructor_contract_instructors_phone_check check (char_length(phone) <= 100),
  constraint instructor_contract_instructors_email_check check (char_length(email) <= 320)
);

create unique index instructor_contract_instructors_workspace_name_idx
  on public.instructor_contract_instructors (workspace_id, lower(btrim(name)));
create index instructor_contract_instructors_workspace_updated_at_idx
  on public.instructor_contract_instructors (workspace_id, updated_at desc, id desc);

alter table public.instructor_contract_instructors enable row level security;
revoke all on table public.instructor_contract_instructors from anon, authenticated;
grant select, insert, update, delete on table public.instructor_contract_instructors to service_role;

comment on table public.instructor_contract_instructors is
  'Workspace-shared instructor contact details for pre-filling instructor contracts. Access is mediated by authenticated server routes.';
