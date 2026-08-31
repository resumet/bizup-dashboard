create extension if not exists "pgcrypto";
create type public.app_role as enum ('admin', 'operator', 'viewer');
create type public.service_status as enum ('active', 'coming_soon', 'disabled');
create table public.workspaces (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table public.workspace_members (workspace_id uuid not null references public.workspaces on delete cascade, user_id uuid not null references auth.users on delete cascade, role public.app_role not null default 'operator', created_at timestamptz not null default now(), primary key (workspace_id, user_id));
create table public.services (id uuid primary key default gen_random_uuid(), service_key text not null unique, title text not null, description text not null default '', icon text not null default 'box', route text not null check (route ~ '^/[a-zA-Z0-9/_-]*$'), status public.service_status not null default 'coming_soon', display_order integer not null default 0, allowed_roles public.app_role[] not null default array['admin','operator']::public.app_role[], created_at timestamptz not null default now());
create table public.course_jobs (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, name text not null, default_course_name text, status text not null default 'draft', latest_version integer not null default 0, valid_count integer not null default 0, error_count integer not null default 0, created_by uuid not null references auth.users, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.job_file_versions (id uuid primary key default gen_random_uuid(), job_id uuid not null references public.course_jobs on delete cascade, version integer not null, storage_path text not null, original_filename text not null, checksum_sha256 text not null, file_size bigint not null check (file_size > 0), mapping jsonb not null default '{}'::jsonb, row_count integer not null default 0, uploaded_by uuid not null references auth.users, created_at timestamptz not null default now(), applied_at timestamptz, unique (job_id, version), unique (job_id, checksum_sha256));
create table public.audit_logs (id bigint generated always as identity primary key, workspace_id uuid references public.workspaces on delete set null, actor_id uuid references auth.users on delete set null, event_type text not null, entity_type text not null, entity_id text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table public.students (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, normalized_phone text not null, name text, email text, profile jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (workspace_id, normalized_phone));
create table public.job_enrollments (id uuid primary key default gen_random_uuid(), job_id uuid not null references public.course_jobs on delete cascade, version integer not null, student_id uuid references public.students on delete set null, normalized_phone text, normalized_values jsonb not null default '{}'::jsonb, original_values jsonb not null default '{}'::jsonb, source_row_number integer not null, is_duplicate boolean not null default false, created_at timestamptz not null default now());
create table public.import_errors (id uuid primary key default gen_random_uuid(), version_id uuid not null references public.job_file_versions on delete cascade, source_row_number integer not null, error_code text not null, field_name text, original_value text, resolved_at timestamptz, created_at timestamptz not null default now());
alter table public.workspaces enable row level security; alter table public.workspace_members enable row level security; alter table public.services enable row level security; alter table public.course_jobs enable row level security; alter table public.job_file_versions enable row level security; alter table public.audit_logs enable row level security; alter table public.students enable row level security; alter table public.job_enrollments enable row level security; alter table public.import_errors enable row level security;
create function public.is_workspace_member(target_workspace uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.workspace_members m where m.workspace_id = target_workspace and m.user_id = auth.uid()) $$;
create policy "authenticated users read services" on public.services for select to authenticated using (true);
create policy "members read workspaces" on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy "members read memberships" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members read jobs" on public.course_jobs for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members create jobs" on public.course_jobs for insert to authenticated with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "members read file versions" on public.job_file_versions for select to authenticated using (exists(select 1 from public.course_jobs j where j.id = job_id and public.is_workspace_member(j.workspace_id)));
create policy "members read audit logs" on public.audit_logs for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members create file versions" on public.job_file_versions for insert to authenticated with check (exists(select 1 from public.course_jobs j where j.id = job_id and public.is_workspace_member(j.workspace_id)) and uploaded_by = auth.uid());
create policy "members read students" on public.students for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members manage students" on public.students for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy "members read enrollments" on public.job_enrollments for select to authenticated using (exists(select 1 from public.course_jobs j where j.id = job_id and public.is_workspace_member(j.workspace_id)));
create policy "members read import errors" on public.import_errors for select to authenticated using (exists(select 1 from public.job_file_versions v join public.course_jobs j on j.id = v.job_id where v.id = version_id and public.is_workspace_member(j.workspace_id)));

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare new_workspace_id uuid;
begin
  insert into public.workspaces (name) values (coalesce(new.raw_user_meta_data ->> 'workspace_name', split_part(new.email, '@', 1) || ' 워크스페이스')) returning id into new_workspace_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (new_workspace_id, new.id, 'admin');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 트리거 생성 전에 이미 존재하던 Auth 사용자도 워크스페이스에 연결한다.
do $$
declare existing_user record;
declare new_workspace_id uuid;
begin
  for existing_user in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    where not exists (select 1 from public.workspace_members m where m.user_id = u.id)
  loop
    insert into public.workspaces (name)
    values (coalesce(existing_user.raw_user_meta_data ->> 'workspace_name', split_part(existing_user.email, '@', 1) || ' 워크스페이스'))
    returning id into new_workspace_id;
    insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, existing_user.id, 'admin');
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-files', 'course-files', false, 20971520, array['text/csv','application/csv','application/vnd.ms-excel'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "members read course files" on storage.objects for select to authenticated using (bucket_id = 'course-files' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "members upload course files" on storage.objects for insert to authenticated with check (bucket_id = 'course-files' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
insert into public.services (service_key, title, description, icon, route, status, display_order) values ('course-roster', '수강생 명단 분석', '신청자 명단 분류·분석·발송·다운로드', 'users', '/services/course-roster', 'active', 10) on conflict (service_key) do update set title = excluded.title, description = excluded.description, route = excluded.route, status = excluded.status;
