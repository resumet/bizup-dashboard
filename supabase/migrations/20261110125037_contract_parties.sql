alter table public.instructor_contract_instructors
  add column if not exists party_type text not null default 'instructor',
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table public.instructor_contract_instructors
  add constraint instructor_contract_instructors_party_type_check
  check (party_type in ('instructor', 'supplier')) not valid;

alter table public.instructor_contract_instructors
  validate constraint instructor_contract_instructors_party_type_check;

create index if not exists instructor_contract_instructors_workspace_party_type_name_idx
  on public.instructor_contract_instructors (workspace_id, party_type, lower(btrim(name)));

comment on table public.instructor_contract_instructors is
  'Workspace-shared transaction party details. party_type is instructor or supplier; supplier template values are stored in details.';
