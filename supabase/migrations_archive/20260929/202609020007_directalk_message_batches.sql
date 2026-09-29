create table if not exists public.message_provider_batches (
  id uuid primary key,
  job_kind text not null check (job_kind in ('roster', 'address-book')),
  message_job_id uuid references public.message_jobs on delete cascade,
  address_book_message_job_id uuid references public.address_book_message_jobs on delete cascade,
  provider text not null default 'directalk',
  chunk_index integer not null check (chunk_index >= 0),
  idempotency_key text not null unique,
  recipient_count integer not null check (recipient_count > 0),
  success_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'pending' check (
    status in (
      'pending',
      'submitted',
      'processing',
      'completed',
      'partial_failed',
      'failed',
      'unknown'
    )
  ),
  http_status integer,
  group_id text,
  provider_status text,
  provider_correlation_id text,
  failure_reason text,
  sync_started_at timestamptz,
  submitted_at timestamptz,
  delivery_checked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (job_kind = 'roster' and message_job_id is not null and address_book_message_job_id is null)
    or
    (job_kind = 'address-book' and message_job_id is null and address_book_message_job_id is not null)
  ),
  unique (message_job_id, chunk_index),
  unique (address_book_message_job_id, chunk_index)
);

alter table public.message_recipients
  add column if not exists provider_batch_id uuid references public.message_provider_batches on delete set null,
  add column if not exists provider_seq integer;

alter table public.address_book_message_recipients
  add column if not exists provider_batch_id uuid references public.message_provider_batches on delete set null,
  add column if not exists provider_seq integer;

create unique index if not exists message_recipients_provider_batch_seq_idx
  on public.message_recipients (provider_batch_id, provider_seq)
  where provider_batch_id is not null and provider_seq is not null;

create unique index if not exists address_message_recipients_provider_batch_seq_idx
  on public.address_book_message_recipients (provider_batch_id, provider_seq)
  where provider_batch_id is not null and provider_seq is not null;

create index if not exists message_provider_batches_roster_poll_idx
  on public.message_provider_batches (message_job_id, status, delivery_checked_at)
  where message_job_id is not null;

create index if not exists message_provider_batches_address_poll_idx
  on public.message_provider_batches (address_book_message_job_id, status, delivery_checked_at)
  where address_book_message_job_id is not null;

alter table public.message_provider_batches enable row level security;

create policy "members read message provider batches"
  on public.message_provider_batches
  for select
  to authenticated
  using (
    (
      message_job_id is not null
      and exists (
        select 1
        from public.message_jobs job
        where job.id = message_provider_batches.message_job_id
          and public.is_workspace_member(job.workspace_id)
      )
    )
    or
    (
      address_book_message_job_id is not null
      and exists (
        select 1
        from public.address_book_message_jobs job
        where job.id = message_provider_batches.address_book_message_job_id
          and public.is_workspace_member(job.workspace_id)
      )
    )
  );

create or replace function public.claim_message_provider_batches(
  p_job_kind text,
  p_job_id uuid,
  p_limit integer default 10
)
returns setof public.message_provider_batches
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select batch.id
    from public.message_provider_batches batch
    where batch.job_kind = p_job_kind
      and (
        (p_job_kind = 'roster' and batch.message_job_id = p_job_id)
        or
        (p_job_kind = 'address-book' and batch.address_book_message_job_id = p_job_id)
      )
      and batch.status not in ('completed', 'partial_failed', 'failed')
      and (
        batch.submitted_at is null
        or batch.submitted_at < now() - interval '5 seconds'
      )
      and (
        batch.delivery_checked_at is null
        or batch.delivery_checked_at < now() - interval '5 seconds'
      )
      and (
        batch.sync_started_at is null
        or batch.sync_started_at < now() - interval '5 minutes'
      )
    order by batch.chunk_index
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.message_provider_batches batch
  set sync_started_at = now()
  from candidates
  where batch.id = candidates.id
  returning batch.*;
$$;

create or replace function public.apply_message_provider_batch_results(
  p_batch_id uuid,
  p_results jsonb,
  p_checked_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_kind text;
  v_updated integer := 0;
begin
  select job_kind
  into v_job_kind
  from public.message_provider_batches
  where id = p_batch_id;

  if v_job_kind is null then
    raise exception 'Message provider batch not found: %', p_batch_id;
  end if;

  if v_job_kind = 'roster' then
    update public.message_recipients recipient
    set
      status = case
        when result.state = 'success' then 'success'
        when result.state = 'failed' then 'failed'
        else 'unknown'
      end,
      provider_status = result.provider_status,
      provider_result_code = result.result_code,
      provider_result_message = result.result_message,
      final_message_type = result.final_message_type,
      provider_correlation_id = coalesce(recipient.provider_correlation_id, result.correlation_id),
      failure_reason = case when result.state = 'failed' then result.result_message else null end,
      delivery_checked_at = p_checked_at,
      completed_at = case when result.terminal then p_checked_at else null end
    from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as result(
      seq integer,
      state text,
      terminal boolean,
      provider_status text,
      result_code text,
      result_message text,
      final_message_type text,
      correlation_id text
    )
    where recipient.provider_batch_id = p_batch_id
      and recipient.provider_seq = result.seq;
    get diagnostics v_updated = row_count;
  else
    update public.address_book_message_recipients recipient
    set
      status = case
        when result.state = 'success' then 'success'
        when result.state = 'failed' then 'failed'
        else 'unknown'
      end,
      provider_status = result.provider_status,
      provider_result_code = result.result_code,
      provider_result_message = result.result_message,
      final_message_type = result.final_message_type,
      provider_correlation_id = coalesce(recipient.provider_correlation_id, result.correlation_id),
      failure_reason = case when result.state = 'failed' then result.result_message else null end,
      delivery_checked_at = p_checked_at,
      completed_at = case when result.terminal then p_checked_at else null end
    from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as result(
      seq integer,
      state text,
      terminal boolean,
      provider_status text,
      result_code text,
      result_message text,
      final_message_type text,
      correlation_id text
    )
    where recipient.provider_batch_id = p_batch_id
      and recipient.provider_seq = result.seq;
    get diagnostics v_updated = row_count;
  end if;

  return v_updated;
end;
$$;

create or replace function public.assign_message_provider_batch_recipients(
  p_batch_id uuid,
  p_recipients jsonb,
  p_requested_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_kind text;
  v_message_job_id uuid;
  v_address_message_job_id uuid;
  v_updated integer := 0;
begin
  select job_kind, message_job_id, address_book_message_job_id
  into v_job_kind, v_message_job_id, v_address_message_job_id
  from public.message_provider_batches
  where id = p_batch_id;

  if v_job_kind is null then
    raise exception 'Message provider batch not found: %', p_batch_id;
  end if;

  if v_job_kind = 'roster' then
    update public.message_recipients recipient
    set
      provider_batch_id = p_batch_id,
      provider_seq = mapping.seq,
      status = 'unknown',
      requested_at = coalesce(recipient.requested_at, p_requested_at)
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as mapping(
      id uuid,
      seq integer
    )
    where recipient.id = mapping.id
      and recipient.message_job_id = v_message_job_id;
    get diagnostics v_updated = row_count;
  else
    update public.address_book_message_recipients recipient
    set
      provider_batch_id = p_batch_id,
      provider_seq = mapping.seq,
      status = 'unknown',
      requested_at = coalesce(recipient.requested_at, p_requested_at)
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as mapping(
      id uuid,
      seq integer
    )
    where recipient.id = mapping.id
      and recipient.message_job_id = v_address_message_job_id;
    get diagnostics v_updated = row_count;
  end if;

  return v_updated;
end;
$$;

revoke all on function public.claim_message_provider_batches(text, uuid, integer) from public;
revoke all on function public.apply_message_provider_batch_results(uuid, jsonb, timestamptz) from public;
revoke all on function public.assign_message_provider_batch_recipients(uuid, jsonb, timestamptz) from public;
grant execute on function public.claim_message_provider_batches(text, uuid, integer) to service_role;
grant execute on function public.apply_message_provider_batch_results(uuid, jsonb, timestamptz) to service_role;
grant execute on function public.assign_message_provider_batch_recipients(uuid, jsonb, timestamptz) to service_role;
