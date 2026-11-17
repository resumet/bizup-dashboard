alter table public.cash_ledger_entries
  add column instructor_allocation_index integer not null default 0
  check (instructor_allocation_index >= 0);

drop index if exists public.cash_ledger_entries_course_settlement_idx;

create unique index cash_ledger_entries_course_settlement_allocation_idx
  on public.cash_ledger_entries (course_settlement_id, instructor_allocation_index)
  where course_settlement_id is not null;

create or replace function ledger_private.sync_confirmed_settlement_payout()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ledger_start_date date;
  payment_date date;
  ledger_entry_date date;
  allocation record;
  payout_party_id uuid;
  paid_amount bigint := 0;
  payout_amount bigint;
begin
  delete from public.cash_ledger_entries
    where course_settlement_id = new.id;

  if new.status <> '정산확정' or new.instructor_payout_amount <= 0 then
    return new;
  end if;

  select settings.start_date into ledger_start_date
    from public.cash_ledger_settings as settings
    where settings.workspace_id = new.workspace_id;
  if ledger_start_date is null then
    raise exception '정산을 확정하기 전에 입출금대장 시작 잔고를 설정해 주세요.' using errcode = '23514';
  end if;

  payment_date := (new.updated_at at time zone 'Asia/Seoul')::date;
  ledger_entry_date := greatest(payment_date, ledger_start_date);

  for allocation in
    with allocation_rows as (
      select ordinality::integer - 1 as allocation_index,
        btrim(value ->> 'name') as instructor_name,
        coalesce(nullif(value ->> 'ratioPercent', '')::numeric, 0) as ratio_percent
      from jsonb_array_elements(coalesce(new.statement_draft -> 'instructorAllocations', '[]'::jsonb)) with ordinality
    ), valid_allocations as (
      select *, count(*) over () as allocation_count
      from allocation_rows
      where instructor_name <> '' and ratio_percent > 0
    ), fallback as (
      select 0 as allocation_index, btrim(course.instructor_name) as instructor_name,
        100::numeric as ratio_percent, 1::bigint as allocation_count
      from public.courses as course
      where course.id = new.course_id and course.workspace_id = new.workspace_id
        and not exists (select 1 from valid_allocations)
    )
    select * from valid_allocations union all select * from fallback order by allocation_index
  loop
    payout_amount := case
      when allocation.allocation_index + 1 < allocation.allocation_count
        then round(new.instructor_payout_amount * allocation.ratio_percent / 100)::bigint
      else new.instructor_payout_amount - paid_amount
    end;
    paid_amount := paid_amount + payout_amount;

    insert into public.cash_ledger_parties (workspace_id, name, note, source_key)
    values (
      new.workspace_id,
      allocation.instructor_name,
      '강의별 정산 확정 강사 지급 자동 등록용 거래처',
      'course_settlement:' || new.id::text || ':' || allocation.allocation_index::text
    ) on conflict on constraint cash_ledger_parties_workspace_source_key_key do nothing;

    select party.id into payout_party_id
      from public.cash_ledger_parties as party
      where party.workspace_id = new.workspace_id
        and party.source_key = 'course_settlement:' || new.id::text || ':' || allocation.allocation_index::text;
    if payout_party_id is null then
      raise exception '강사 지급 거래처를 준비하지 못했습니다.';
    end if;

    insert into public.cash_ledger_entries (
      workspace_id, kind, title, party_id, course_id, amount, entry_date, note,
      course_settlement_id, instructor_allocation_index
    ) values (
      new.workspace_id, 'expense', left(format('강의료 지급-%s', allocation.instructor_name), 200), payout_party_id,
      new.course_id, payout_amount, ledger_entry_date, '강사 지급액 정산 자동 등록',
      new.id, allocation.allocation_index
    ) on conflict (course_settlement_id, instructor_allocation_index) where course_settlement_id is not null
    do update set
      kind = excluded.kind, title = excluded.title, party_id = excluded.party_id, course_id = excluded.course_id,
      amount = excluded.amount, entry_date = excluded.entry_date, note = excluded.note;
  end loop;

  return new;
end;
$$;
