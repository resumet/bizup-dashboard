create table public.business_trip_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  title text not null,
  final_cost bigint not null default 0,
  payment_completed boolean not null default false,
  payment_completed_at timestamptz,
  file_path text,
  file_name text,
  file_size bigint,
  file_mime_type text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_trip_reports_author_name_check
    check (char_length(btrim(author_name)) between 1 and 100),
  constraint business_trip_reports_title_check
    check (char_length(btrim(title)) between 1 and 200),
  constraint business_trip_reports_final_cost_check
    check (final_cost between 0 and 9007199254740991),
  constraint business_trip_reports_payment_state_check
    check (payment_completed = (payment_completed_at is not null)),
  constraint business_trip_reports_file_state_check
    check (
      (file_path is null and file_name is null and file_size is null and file_mime_type is null)
      or
      (file_path is not null and file_name is not null and file_size is not null and file_mime_type is not null)
    ),
  constraint business_trip_reports_file_name_check
    check (file_name is null or char_length(btrim(file_name)) between 1 and 255),
  constraint business_trip_reports_file_size_check
    check (file_size is null or file_size between 1 and 52428800),
  constraint business_trip_reports_version_check
    check (version > 0)
);

comment on table public.business_trip_reports is '워크스페이스 출장보고서 게시판';
comment on column public.business_trip_reports.author_name is '작성 당시 작성자 이름 스냅샷';
comment on column public.business_trip_reports.final_cost is '원 단위 최종 출장 비용';

create index business_trip_reports_workspace_created_at_idx
  on public.business_trip_reports (workspace_id, created_at desc, id desc);
create index business_trip_reports_author_idx
  on public.business_trip_reports (author_id, created_at desc)
  where author_id is not null;
create index business_trip_reports_unpaid_idx
  on public.business_trip_reports (workspace_id, created_at desc)
  where payment_completed = false and final_cost > 0;

alter table public.business_trip_reports enable row level security;

revoke all on table public.business_trip_reports from anon, authenticated;
grant select, insert, update, delete on table public.business_trip_reports to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'business-trip-reports',
  'business-trip-reports',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
