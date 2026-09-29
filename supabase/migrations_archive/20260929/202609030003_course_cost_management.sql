create table if not exists public.course_costs (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses on delete cascade,
  category_code text not null default 'CUSTOM',
  name text not null check (length(name) between 1 and 100),
  burden_type text not null check (burden_type in ('COMPANY','INSTRUCTOR','SHARED','UNCLASSIFIED')),
  manager_user_id uuid references auth.users on delete set null,
  manager_name text not null check (length(manager_name) between 1 and 100),
  gross_amount bigint not null check (gross_amount >= 0),
  supply_amount bigint not null check (supply_amount >= 0),
  vat_amount bigint not null check (vat_amount >= 0 and gross_amount = supply_amount + vat_amount),
  tax_type text not null check (tax_type in ('TAXABLE','TAX_FREE','ZERO_RATED','REVIEW_REQUIRED')),
  paid_date date,
  status text not null default 'PLANNED' check (status in ('PLANNED','PAID','CANCELED')),
  evidence_required boolean not null default true,
  evidence_needs_review boolean not null default false,
  evidence_types text[] not null default '{}',
  other_evidence_type text not null default '',
  company_share_rate numeric(5,2) not null default 100 check (company_share_rate between 0 and 100),
  instructor_share_rate numeric(5,2) not null default 0 check (instructor_share_rate between 0 and 100 and company_share_rate + instructor_share_rate in (0,100)),
  company_share_amount bigint not null default 0 check (company_share_amount >= 0),
  instructor_share_amount bigint not null default 0 check (instructor_share_amount >= 0 and company_share_amount + instructor_share_amount in (0,gross_amount)),
  include_in_settlement boolean not null default true,
  note text not null default '' check (length(note) <= 1000),
  migrated_from text unique,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status <> 'PAID' or paid_date is not null),
  check ('기타' <> all(evidence_types) or length(other_evidence_type) > 0)
);

create table if not exists public.course_cost_attachments (
  id uuid primary key default gen_random_uuid(),
  course_cost_id uuid not null references public.course_costs on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 20971520),
  uploaded_by uuid not null references auth.users,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.settlement_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.course_settlement_projects on delete cascade,
  course_cost_id uuid references public.course_costs on delete set null,
  cost_snapshot jsonb not null check (jsonb_typeof(cost_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (settlement_id, course_cost_id)
);

create table if not exists public.course_cost_audit_logs (
  id bigint generated always as identity primary key,
  course_cost_id uuid references public.course_costs on delete set null,
  course_id uuid not null references public.courses on delete cascade,
  actor_id uuid references auth.users on delete set null,
  action text not null check (action in ('CREATED','UPDATED','DELETED','RESTORED','SETTLEMENT_CHANGED','ATTACHMENT_ADDED','ATTACHMENT_DELETED','MIGRATED')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists course_costs_course_idx on public.course_costs (course_id, burden_type, paid_date, created_at);
create index if not exists course_cost_attachments_cost_idx on public.course_cost_attachments (course_cost_id, uploaded_at);
create index if not exists course_cost_audit_course_idx on public.course_cost_audit_logs (course_id, created_at desc);

alter table public.course_costs enable row level security;
alter table public.course_cost_attachments enable row level security;
alter table public.settlement_cost_snapshots enable row level security;
alter table public.course_cost_audit_logs enable row level security;

drop policy if exists "members manage course costs" on public.course_costs;
create policy "members manage course costs" on public.course_costs for all to authenticated
  using (exists(select 1 from public.courses c where c.id = course_id and public.is_workspace_member(c.workspace_id)))
  with check (exists(select 1 from public.courses c where c.id = course_id and public.is_workspace_member(c.workspace_id)));
drop policy if exists "members manage course cost attachments" on public.course_cost_attachments;
create policy "members manage course cost attachments" on public.course_cost_attachments for all to authenticated
  using (exists(select 1 from public.course_costs x join public.courses c on c.id=x.course_id where x.id=course_cost_id and public.is_workspace_member(c.workspace_id)))
  with check (exists(select 1 from public.course_costs x join public.courses c on c.id=x.course_id where x.id=course_cost_id and public.is_workspace_member(c.workspace_id)));
drop policy if exists "members read settlement cost snapshots" on public.settlement_cost_snapshots;
create policy "members read settlement cost snapshots" on public.settlement_cost_snapshots for select to authenticated
  using (exists(select 1 from public.course_settlement_projects p where p.id=settlement_id and public.is_workspace_member(p.workspace_id)));
drop policy if exists "members read course cost audit logs" on public.course_cost_audit_logs;
create policy "members read course cost audit logs" on public.course_cost_audit_logs for select to authenticated
  using (exists(select 1 from public.courses c where c.id=course_id and public.is_workspace_member(c.workspace_id)));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('course-cost-evidence','course-cost-evidence',false,20971520,array[
  'application/pdf','image/jpeg','image/png','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]) on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "members read course cost evidence" on storage.objects;
create policy "members read course cost evidence" on storage.objects for select to authenticated
  using (bucket_id='course-cost-evidence' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
drop policy if exists "members upload course cost evidence" on storage.objects;
create policy "members upload course cost evidence" on storage.objects for insert to authenticated
  with check (bucket_id='course-cost-evidence' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));

-- 과거 정산서 비용을 새 원장으로 복사하되 확정본 JSON은 수정하지 않는다.
insert into public.course_costs (
  course_id,category_code,name,burden_type,manager_name,gross_amount,supply_amount,vat_amount,
  tax_type,paid_date,status,evidence_required,evidence_needs_review,evidence_types,company_share_rate,instructor_share_rate,
  company_share_amount,instructor_share_amount,include_in_settlement,note,migrated_from,created_by,updated_by
)
select p.course_id,'MIGRATED',coalesce(nullif(cost->>'name',''),'기존 정산 비용'),burden.kind,
  coalesce(nullif(cost->>'manager',''),'담당자 미지정'),parsed.gross,
  round(parsed.gross::numeric / 1.1)::bigint,
  parsed.gross - round(parsed.gross::numeric / 1.1)::bigint,
  'TAXABLE',null,'PLANNED',false,false,'{}',
  case burden.kind when 'COMPANY' then 100 when 'SHARED' then 50 else 0 end,
  case burden.kind when 'INSTRUCTOR' then 100 when 'SHARED' then 50 else 0 end,
  case burden.kind when 'COMPANY' then parsed.gross when 'SHARED' then round(parsed.gross::numeric / 2)::bigint else 0 end,
  parsed.gross - case burden.kind when 'COMPANY' then parsed.gross when 'SHARED' then round(parsed.gross::numeric / 2)::bigint else 0 end,
  true,'',
  concat('settlement:',p.id,':',coalesce(cost->>'id',ordinality::text)),p.created_by,p.created_by
from public.course_settlement_projects p
cross join lateral jsonb_array_elements(coalesce(p.statement_draft->'costs','[]'::jsonb)) with ordinality as x(cost,ordinality)
cross join lateral (
  select greatest(0,coalesce(nullif(regexp_replace(cost->>'amount','[^0-9.-]','','g'),''),'0')::numeric::bigint) as gross
) parsed
cross join lateral (
  select case cost->>'burden' when 'INSTRUCTOR' then 'INSTRUCTOR' when 'instructor' then 'INSTRUCTOR'
    when 'SHARED' then 'SHARED' when 'shared' then 'SHARED' else 'COMPANY' end as kind
) burden
on conflict (migrated_from) do nothing;

insert into public.course_cost_audit_logs(course_cost_id,course_id,actor_id,action,after_data)
select c.id,c.course_id,c.created_by,'MIGRATED',to_jsonb(c)
from public.course_costs c
where c.migrated_from is not null
  and not exists(select 1 from public.course_cost_audit_logs l where l.course_cost_id=c.id and l.action='MIGRATED');

notify pgrst, 'reload schema';
