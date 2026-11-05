alter table public.instructor_contract_templates
  drop constraint instructor_contract_templates_pkey;

alter table public.instructor_contract_templates
  add column id uuid not null default gen_random_uuid(),
  add column name text not null default '기본 계약서',
  add column created_at timestamptz not null default now(),
  add column created_by uuid references auth.users(id) on delete set null;

alter table public.instructor_contract_templates
  add constraint instructor_contract_templates_pkey primary key (id),
  add constraint instructor_contract_templates_name_check
    check (char_length(btrim(name)) between 1 and 100);

create unique index instructor_contract_templates_workspace_name_idx
  on public.instructor_contract_templates (workspace_id, lower(btrim(name)));

create index instructor_contract_templates_workspace_updated_at_idx
  on public.instructor_contract_templates (workspace_id, updated_at desc, id desc);

comment on table public.instructor_contract_templates is
  'Named instructor contract templates shared within a workspace. Access is mediated by authenticated server routes.';

create table public.instructor_contracts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid references public.instructor_contract_templates(id) on delete set null,
  template_name text not null,
  title text not null,
  instructor_name text not null default '',
  lecture_name text not null default '',
  contract_values jsonb not null,
  rendered_content jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint instructor_contracts_template_name_check
    check (char_length(btrim(template_name)) between 1 and 100),
  constraint instructor_contracts_title_check
    check (char_length(btrim(title)) between 1 and 200),
  constraint instructor_contracts_instructor_name_check
    check (char_length(instructor_name) <= 200),
  constraint instructor_contracts_lecture_name_check
    check (char_length(lecture_name) <= 200),
  constraint instructor_contracts_values_check
    check (jsonb_typeof(contract_values) = 'object'),
  constraint instructor_contracts_content_check
    check (jsonb_typeof(rendered_content) = 'array'),
  constraint instructor_contracts_created_by_name_check
    check (char_length(btrim(created_by_name)) between 1 and 100)
);

comment on table public.instructor_contracts is
  'Saved instructor contracts with immutable rendered content snapshots.';
comment on column public.instructor_contracts.template_name is
  'Template name snapshot at contract creation time.';
comment on column public.instructor_contracts.rendered_content is
  'Rendered contract body snapshot that does not change when its template changes.';

create index instructor_contracts_workspace_created_at_idx
  on public.instructor_contracts (workspace_id, created_at desc, id desc);
create index instructor_contracts_template_idx
  on public.instructor_contracts (template_id, created_at desc)
  where template_id is not null;

alter table public.instructor_contracts enable row level security;

revoke all on table public.instructor_contract_templates from anon, authenticated;
revoke all on table public.instructor_contracts from anon, authenticated;
grant select, insert, update, delete on table public.instructor_contract_templates to service_role;
grant select, insert on table public.instructor_contracts to service_role;
