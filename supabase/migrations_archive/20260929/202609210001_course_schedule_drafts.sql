create table if not exists public.course_schedule_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  instructor_name text not null check (char_length(instructor_name) between 1 and 100),
  topic text not null check (char_length(topic) between 1 and 200),
  memo text not null default '' check (char_length(memo) <= 5000),
  course_size text not null default 'large' check (course_size in ('large', 'small')),
  color_index smallint not null default 0 check (color_index between 0 and 9),
  scheduled_date date,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_schedule_drafts_workspace_created_idx
  on public.course_schedule_drafts (workspace_id, created_at, id);

create index if not exists course_schedule_drafts_workspace_scheduled_idx
  on public.course_schedule_drafts (workspace_id, scheduled_date)
  where scheduled_date is not null;

alter table public.course_schedule_drafts enable row level security;

create policy "members read course schedule drafts"
  on public.course_schedule_drafts for select to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "members create course schedule drafts"
  on public.course_schedule_drafts for insert to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
  );

create policy "members update course schedule drafts"
  on public.course_schedule_drafts for update to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "members delete course schedule drafts"
  on public.course_schedule_drafts for delete to authenticated
  using (public.is_workspace_member(workspace_id));

create or replace function public.touch_course_schedule_draft_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_course_schedule_draft_updated_at
  on public.course_schedule_drafts;
create trigger touch_course_schedule_draft_updated_at
  before update on public.course_schedule_drafts
  for each row execute function public.touch_course_schedule_draft_updated_at();

-- 예비 강의가 감사 로그에만 저장되던 구버전 데이터를 전용 테이블로 옮긴다.
with latest_legacy_events as (
  select distinct on (workspace_id, entity_id)
    workspace_id,
    actor_id,
    entity_id,
    event_type,
    metadata,
    created_at
  from public.audit_logs
  where workspace_id is not null
    and entity_type = 'course_schedule_draft'
    and event_type in (
      'course_schedule_draft.upserted',
      'course_schedule_draft.deleted'
    )
    and entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  order by workspace_id, entity_id, created_at desc, id desc
), legacy_created_at as (
  select workspace_id, entity_id, min(created_at) as created_at
  from public.audit_logs
  where workspace_id is not null
    and entity_type = 'course_schedule_draft'
    and event_type = 'course_schedule_draft.upserted'
  group by workspace_id, entity_id
)
insert into public.course_schedule_drafts (
  id,
  workspace_id,
  instructor_name,
  topic,
  memo,
  course_size,
  color_index,
  scheduled_date,
  created_by,
  created_at,
  updated_at
)
select
  latest.entity_id::uuid,
  latest.workspace_id,
  left(trim(latest.metadata ->> 'instructorName'), 100),
  left(trim(latest.metadata ->> 'topic'), 200),
  left(trim(coalesce(latest.metadata ->> 'memo', '')), 5000),
  case when latest.metadata ->> 'courseSize' = 'small' then 'small' else 'large' end,
  case
    when latest.metadata ->> 'colorIndex' ~ '^\d+$'
      then least(9, greatest(0, (latest.metadata ->> 'colorIndex')::integer))
    else 0
  end,
  case
    when latest.metadata ->> 'scheduledDate' ~ '^\d{4}-\d{2}-\d{2}$'
      then (latest.metadata ->> 'scheduledDate')::date
    else null
  end,
  latest.actor_id,
  coalesce(created.created_at, latest.created_at),
  latest.created_at
from latest_legacy_events latest
left join legacy_created_at created
  on created.workspace_id = latest.workspace_id
  and created.entity_id = latest.entity_id
where latest.event_type = 'course_schedule_draft.upserted'
  and nullif(trim(latest.metadata ->> 'instructorName'), '') is not null
  and nullif(trim(latest.metadata ->> 'topic'), '') is not null
on conflict (id) do nothing;
