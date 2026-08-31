create table public.address_books (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade,
  name text not null, contact_count integer not null default 0, created_by uuid not null references auth.users,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.address_book_contacts (
  id uuid primary key default gen_random_uuid(), address_book_id uuid not null references public.address_books on delete cascade,
  normalized_phone text not null, name text, email text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(address_book_id, normalized_phone)
);
create table public.address_book_imports (
  id uuid primary key default gen_random_uuid(), address_book_id uuid not null references public.address_books on delete cascade,
  original_filename text not null, total_rows integer not null, imported_rows integer not null, skipped_rows integer not null,
  uploaded_by uuid not null references auth.users, created_at timestamptz not null default now()
);
create table public.message_templates (
  id uuid primary key default gen_random_uuid(), workspace_id uuid references public.workspaces on delete cascade,
  name text not null, template_code text not null, applicant_variable text not null default '신청자', course_variable text not null default '강좌명',
  is_system boolean not null default false, created_by uuid references auth.users, created_at timestamptz not null default now(),
  unique(workspace_id, template_code)
);
create table public.address_book_message_jobs (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade,
  address_book_id uuid not null references public.address_books on delete cascade, template_id uuid not null references public.message_templates,
  template_code text not null, course_name text not null, target_scope text not null check(target_scope in ('all','filtered','selected','test')),
  status text not null default 'processing', requested_by uuid not null references auth.users,
  requested_count integer not null default 0, success_count integer not null default 0, failed_count integer not null default 0,
  created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.address_book_message_recipients (
  id uuid primary key default gen_random_uuid(), message_job_id uuid not null references public.address_book_message_jobs on delete cascade,
  contact_id uuid references public.address_book_contacts on delete set null, recipient_name text, normalized_phone text not null,
  status text not null default 'pending', http_status integer, shoong_code text, group_id text, message_id text, failure_reason text,
  requested_at timestamptz, completed_at timestamptz
);
alter table public.address_books enable row level security; alter table public.address_book_contacts enable row level security;
alter table public.address_book_imports enable row level security; alter table public.message_templates enable row level security;
alter table public.address_book_message_jobs enable row level security; alter table public.address_book_message_recipients enable row level security;
create policy "members manage address books" on public.address_books for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
create policy "members manage address contacts" on public.address_book_contacts for all to authenticated using(exists(select 1 from public.address_books b where b.id=address_book_id and public.is_workspace_member(b.workspace_id))) with check(exists(select 1 from public.address_books b where b.id=address_book_id and public.is_workspace_member(b.workspace_id)));
create policy "members read address imports" on public.address_book_imports for select to authenticated using(exists(select 1 from public.address_books b where b.id=address_book_id and public.is_workspace_member(b.workspace_id)));
create policy "members manage templates" on public.message_templates for all to authenticated using(workspace_id is null or public.is_workspace_member(workspace_id)) with check(workspace_id is not null and public.is_workspace_member(workspace_id));
create policy "members read address message jobs" on public.address_book_message_jobs for select to authenticated using(public.is_workspace_member(workspace_id));
create policy "members read address recipients" on public.address_book_message_recipients for select to authenticated using(exists(select 1 from public.address_book_message_jobs j where j.id=message_job_id and public.is_workspace_member(j.workspace_id)));
insert into public.message_templates(name,template_code,applicant_variable,course_variable,is_system) values('전용 입장 링크 안내','dedicated_entry_link_guide','신청자','강좌명',true);
insert into public.services(service_key,title,description,icon,route,status,display_order) values('message-automation','알림톡·문자 자동화','주소록을 만들고 Shoong 템플릿으로 메시지를 발송합니다.','message-square','/services/message-automation','active',20) on conflict(service_key) do update set title=excluded.title,description=excluded.description,route=excluded.route,status=excluded.status;
