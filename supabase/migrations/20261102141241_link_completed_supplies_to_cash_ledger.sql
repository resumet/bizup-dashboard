alter table public.cash_ledger_parties
  add column source_key text;

alter table public.cash_ledger_parties
  add constraint cash_ledger_parties_source_key_check
    check (source_key is null or char_length(btrim(source_key)) between 1 and 100),
  add constraint cash_ledger_parties_workspace_source_key_key
    unique (workspace_id, source_key);

comment on column public.cash_ledger_parties.source_key is
  '자동 연동 거래처를 식별하는 서버 관리 키. 일반 거래처는 null';

alter table public.supply_requests
  add constraint supply_requests_id_workspace_key unique (id, workspace_id);

alter table public.cash_ledger_entries
  add column supply_request_id uuid;

alter table public.cash_ledger_entries
  add constraint cash_ledger_entries_supply_request_workspace_fkey
    foreign key (supply_request_id, workspace_id)
    references public.supply_requests(id, workspace_id)
    on delete cascade;

create unique index cash_ledger_entries_supply_request_idx
  on public.cash_ledger_entries (supply_request_id)
  where supply_request_id is not null;

comment on column public.cash_ledger_entries.supply_request_id is
  '비품 구매완료에서 자동 생성된 비용의 원본 비품 신청 ID';

create function ledger_private.sync_supply_request_expense()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ledger_start_date date;
  purchase_date date;
  expense_date date;
  supply_party_id uuid;
begin
  if new.purchased and new.price_krw > 0 then
    if new.price_krw > 1000000000000 then
      raise exception '비품 금액은 입출금 장부의 최대 금액인 1조 원을 초과할 수 없습니다.'
        using errcode = '23514';
    end if;

    select settings.start_date
      into ledger_start_date
      from public.cash_ledger_settings as settings
      where settings.workspace_id = new.workspace_id;

    if ledger_start_date is null then
      raise exception '비품을 구매완료 처리하기 전에 입출금 장부의 시작 잔고를 설정해 주세요.'
        using errcode = '23514';
    end if;

    insert into public.cash_ledger_parties (
      workspace_id,
      name,
      note,
      source_key
    ) values (
      new.workspace_id,
      '비품 구매',
      '비품 관리 구매완료 비용 자동 연동용 거래처',
      'supply_requests'
    )
    on conflict on constraint cash_ledger_parties_workspace_source_key_key do nothing;

    select party.id
      into supply_party_id
      from public.cash_ledger_parties as party
      where party.workspace_id = new.workspace_id
        and party.source_key = 'supply_requests';

    if supply_party_id is null then
      raise exception '비품 구매 비용 거래처를 준비하지 못했습니다.';
    end if;

    purchase_date := (new.purchased_at at time zone 'Asia/Seoul')::date;
    expense_date := greatest(purchase_date, ledger_start_date);

    insert into public.cash_ledger_entries (
      workspace_id,
      kind,
      title,
      party_id,
      course_id,
      amount,
      entry_date,
      note,
      supply_request_id
    ) values (
      new.workspace_id,
      'expense',
      left(format('비품 구매 - %s', new.item_name), 200),
      supply_party_id,
      null,
      new.price_krw,
      expense_date,
      left(format(
        '비품 관리에서 구매완료 처리되어 자동 등록됨. 구매완료일: %s / 신청자: %s / 신청 목적: %s%s',
        purchase_date,
        new.requester_name,
        new.purpose,
        case when new.note = '' then '' else format(' / 비고: %s', new.note) end
      ), 4000),
      new.id
    )
    on conflict (supply_request_id) where supply_request_id is not null
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
      where supply_request_id = new.id;
  end if;

  return new;
end;
$$;

revoke execute on function ledger_private.sync_supply_request_expense()
  from public, anon, authenticated;
grant execute on function ledger_private.sync_supply_request_expense()
  to service_role;

create trigger supply_requests_sync_cash_ledger_expense
after insert or update on public.supply_requests
for each row execute function ledger_private.sync_supply_request_expense();

-- Backfill existing completed purchases through the same trigger path.
update public.supply_requests
set purchased_at = purchased_at
where purchased and price_krw > 0;
