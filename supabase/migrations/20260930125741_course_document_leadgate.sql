create table if not exists public.course_document_settings (
  course_id uuid primary key references public.courses(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  external_edit_enabled boolean not null default false,
  external_access_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_document_settings_token_check
    check (external_access_token ~ '^[a-f0-9]{48}$')
);

create table if not exists public.course_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  instructor_name text not null default '',
  title text not null,
  slug text not null unique,
  content jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  lead_gate_enabled boolean not null default false,
  lead_gate_after_block_id text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz,
  constraint course_documents_title_check
    check (char_length(btrim(title)) between 1 and 200),
  constraint course_documents_slug_check
    check (slug ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  constraint course_documents_content_array_check
    check (jsonb_typeof(content) = 'array'),
  constraint course_documents_status_check
    check (status in ('draft', 'published')),
  constraint course_documents_gate_check
    check (
      (lead_gate_enabled = false and lead_gate_after_block_id is null)
      or
      (lead_gate_enabled = true and nullif(btrim(lead_gate_after_block_id), '') is not null)
    )
);

create table if not exists public.course_document_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  document_id uuid not null references public.course_documents(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  instructor_name text not null default '',
  name text not null,
  phone text not null,
  phone_normalized text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  created_at timestamptz not null default now(),
  constraint course_document_leads_name_check
    check (char_length(btrim(name)) between 1 and 80),
  constraint course_document_leads_phone_check
    check (phone_normalized ~ '^0[0-9]{8,10}$'),
  constraint course_document_leads_document_phone_key
    unique (document_id, phone_normalized)
);

create table if not exists public.course_document_blocked_phones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  phone_normalized text not null,
  memo text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint course_document_blocked_phone_check
    check (phone_normalized ~ '^0[0-9]{8,10}$'),
  constraint course_document_blocked_phones_workspace_phone_key
    unique (workspace_id, phone_normalized)
);

create index if not exists course_document_settings_workspace_idx
  on public.course_document_settings (workspace_id, updated_at desc);
create index if not exists course_documents_course_idx
  on public.course_documents (course_id, updated_at desc)
  where deleted_at is null;
create index if not exists course_documents_workspace_status_idx
  on public.course_documents (workspace_id, status, updated_at desc)
  where deleted_at is null;
create index if not exists course_document_leads_document_created_idx
  on public.course_document_leads (document_id, created_at desc);
create index if not exists course_document_leads_workspace_created_idx
  on public.course_document_leads (workspace_id, created_at desc);
create index if not exists course_document_leads_instructor_created_idx
  on public.course_document_leads (workspace_id, instructor_name, created_at desc);

create or replace function public.touch_course_document_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_course_document_settings_updated_at on public.course_document_settings;
create trigger touch_course_document_settings_updated_at
before update on public.course_document_settings
for each row execute function public.touch_course_document_updated_at();

drop trigger if exists touch_course_documents_updated_at on public.course_documents;
create trigger touch_course_documents_updated_at
before update on public.course_documents
for each row execute function public.touch_course_document_updated_at();

alter table public.course_document_settings enable row level security;
alter table public.course_documents enable row level security;
alter table public.course_document_leads enable row level security;
alter table public.course_document_blocked_phones enable row level security;

revoke all on table public.course_document_settings from anon, authenticated;
revoke all on table public.course_documents from anon, authenticated;
revoke all on table public.course_document_leads from anon, authenticated;
revoke all on table public.course_document_blocked_phones from anon, authenticated;

grant all on table public.course_document_settings to service_role;
grant all on table public.course_documents to service_role;
grant all on table public.course_document_leads to service_role;
grant all on table public.course_document_blocked_phones to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'course-document-images',
  'course-document-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

revoke all on function public.touch_course_document_updated_at() from public, anon, authenticated;
grant execute on function public.touch_course_document_updated_at() to service_role;
