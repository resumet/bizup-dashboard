alter table public.course_settlement_projects
  add column instructor_payout_amount bigint not null default 0
    check (instructor_payout_amount between 0 and 1000000000000),
  add constraint course_settlement_projects_id_workspace_key unique (id, workspace_id);

alter table public.cash_ledger_entries
  add column course_settlement_id uuid;

alter table public.cash_ledger_entries
  add constraint cash_ledger_entries_course_settlement_workspace_fkey
    foreign key (course_settlement_id, workspace_id)
    references public.course_settlement_projects(id, workspace_id)
    on delete cascade;

create unique index cash_ledger_entries_course_settlement_idx
  on public.cash_ledger_entries (course_settlement_id)
  where course_settlement_id is not null;

comment on column public.cash_ledger_entries.course_settlement_id is
  '정산 확정 시 자동 등록된 강사 지급 비용의 원본 정산 ID';

create function ledger_private.sync_confirmed_settlement_payout()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ledger_start_date date;
  payment_date date;
  ledger_entry_date date;
  instructor_name text;
  payout_party_id uuid;
begin
  if new.status = '정산확정' and new.instructor_payout_amount > 0 then
    select settings.start_date
      into ledger_start_date
      from public.cash_ledger_settings as settings
      where settings.workspace_id = new.workspace_id;

    if ledger_start_date is null then
      raise exception '정산을 확정하기 전에 입출금 장부의 시작 잔고를 설정해 주세요.'
        using errcode = '23514';
    end if;

    select course.instructor_name
      into instructor_name
      from public.courses as course
      where course.id = new.course_id
        and course.workspace_id = new.workspace_id;

    if instructor_name is null or btrim(instructor_name) = '' then
      raise exception '정산 확정 강의의 강사명을 확인해 주세요.'
        using errcode = '23514';
    end if;

    insert into public.cash_ledger_parties (
      workspace_id,
      name,
      note,
      source_key
    ) values (
      new.workspace_id,
      btrim(instructor_name),
      '강의별 정산 확정 강사 지급 자동 등록용 거래처',
      'course_settlement:' || new.id::text
    )
    on conflict on constraint cash_ledger_parties_workspace_source_key_key do nothing;

    select party.id
      into payout_party_id
      from public.cash_ledger_parties as party
      where party.workspace_id = new.workspace_id
        and party.source_key = 'course_settlement:' || new.id::text;

    if payout_party_id is null then
      raise exception '강사 지급 거래처를 준비하지 못했습니다.';
    end if;

    payment_date := (new.updated_at at time zone 'Asia/Seoul')::date;
    ledger_entry_date := greatest(payment_date, ledger_start_date);

    insert into public.cash_ledger_entries (
      workspace_id,
      kind,
      title,
      party_id,
      course_id,
      amount,
      entry_date,
      note,
      course_settlement_id
    ) values (
      new.workspace_id,
      'expense',
      left(format('강의료 지급-%s', btrim(instructor_name)), 200),
      payout_party_id,
      new.course_id,
      new.instructor_payout_amount,
      ledger_entry_date,
      '강사 지급액 정산 자동 등록',
      new.id
    )
    on conflict (course_settlement_id) where course_settlement_id is not null
    do update set
      kind = excluded.kind,
      title = excluded.title,
      party_id = excluded.party_id,
      course_id = excluded.course_id,
      amount = excluded.amount,
      entry_date = excluded.entry_date,
      note = excluded.note;
  else
    delete from public.cash_ledger_entries
      where course_settlement_id = new.id;
  end if;

  return new;
end;
$$;

revoke execute on function ledger_private.sync_confirmed_settlement_payout()
  from public, anon, authenticated;
grant execute on function ledger_private.sync_confirmed_settlement_payout()
  to service_role;

create trigger course_settlement_projects_sync_cash_ledger_payout
after insert or update on public.course_settlement_projects
for each row execute function ledger_private.sync_confirmed_settlement_payout();
