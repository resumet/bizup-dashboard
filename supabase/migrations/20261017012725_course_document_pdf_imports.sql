create table public.course_document_pdf_imports (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.course_documents(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id),
  course_id uuid not null references public.courses(id),
  file_name text not null check (length(file_name) between 1 and 200),
  file_size bigint not null check (file_size between 1 and 52428800),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  source_path text not null,
  status text not null default 'uploaded' check (status in ('uploaded','queued','processing','needs_review','completed','failed')),
  stage text not null default '업로드',
  progress integer not null default 0 check (progress between 0 and 100),
  options jsonb not null default '{"mode":"structure","ocr":false,"images":true}',
  result jsonb,
  error_message text,
  attempts integer not null default 0,
  retries integer not null default 0 check (retries between 0 and 3),
  lease_token uuid,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index course_document_pdf_imports_document_idx on public.course_document_pdf_imports(document_id, created_at desc);
create index course_document_pdf_imports_queue_idx on public.course_document_pdf_imports(status, created_at);
alter table public.course_document_pdf_imports enable row level security;
-- All access goes through the same course/member or external-token checks as the editor.
revoke all on public.course_document_pdf_imports from anon, authenticated;
grant all on public.course_document_pdf_imports to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('course-document-pdfs','course-document-pdfs',false,52428800,array['application/pdf','image/png','application/json'])
on conflict (id) do nothing;

create function public.claim_course_document_pdf_import(p_id uuid default null)
returns setof public.course_document_pdf_imports
language plpgsql security invoker set search_path = '' as $$
begin
  -- A crashed worker's lease expires. Exhausted jobs become retryable failures.
  update public.course_document_pdf_imports
  set status='failed', error_message='변환 시간이 초과되었습니다. 다시 시도해 주세요.', updated_at=now()
  where status='processing' and updated_at < now()-interval '10 minutes' and attempts>=3;
  return query
  with candidate as (
    select id from public.course_document_pdf_imports
    where (status='queued' or (status='processing' and updated_at < now()-interval '10 minutes')) and attempts<3
      and (p_id is null or id=p_id)
    order by created_at for update skip locked limit 1
  )
  update public.course_document_pdf_imports j
  set status='processing', stage='분석', progress=10, attempts=j.attempts+1,
      lease_token=gen_random_uuid(), updated_at=now(), error_message=null
  from candidate where j.id=candidate.id returning j.*;
end;
$$;
revoke all on function public.claim_course_document_pdf_import(uuid) from public, anon, authenticated;
grant execute on function public.claim_course_document_pdf_import(uuid) to service_role;
