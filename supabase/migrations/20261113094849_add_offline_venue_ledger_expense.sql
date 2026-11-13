-- Permit shared offline-venue costs to create or update their cash-ledger expense.
create or replace function public.record_course_ad_operation_ledger_expense(
  p_course_id uuid,
  p_course_cost_id uuid,
  p_actor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_course_name text;
  v_cost public.course_costs%rowtype;
  v_ledger_start_date date;
  v_entry_date date;
  v_party_id uuid;
  v_entry_id uuid;
  v_category_name text;
  v_party_name text;
  v_party_note text;
  v_party_source_key text;
begin
  select course.workspace_id, course.name into v_workspace_id, v_course_name
    from public.courses as course where course.id = p_course_id;
  if v_workspace_id is null or not exists (
    select 1 from public.workspace_members as member
    where member.workspace_id = v_workspace_id and member.user_id = p_actor_id
  ) then raise exception '비용을 관리할 권한이 없습니다.'; end if;

  select * into v_cost from public.course_costs as cost
    where cost.id = p_course_cost_id and cost.course_id = p_course_id and cost.deleted_at is null
    for update;
  if not found then raise exception '비용을 찾을 수 없습니다.'; end if;

  case v_cost.category_code
    when 'AD_OPERATION' then
      v_category_name := '광고집행비';
      v_party_name := '엠리치컴퍼니';
      v_party_note := '강의 비용 정산 광고집행비 장부 기록용 거래처';
      v_party_source_key := 'course_costs:ad_operation';
    when 'OFFLINE_VENUE' then
      v_category_name := '오프라인 장소 이용료';
      v_party_name := '오프라인 장소 이용료';
      v_party_note := '강의 비용 정산 오프라인 장소 이용료 장부 기록용 거래처';
      v_party_source_key := 'course_costs:offline_venue';
    else
      raise exception '광고집행비 또는 오프라인 장소 이용료만 입출금 장부에 기록할 수 있습니다.';
  end case;
  if v_cost.gross_amount <= 0 then raise exception '0원 초과 비용만 입출금 장부에 기록할 수 있습니다.'; end if;

  select settings.start_date into v_ledger_start_date from public.cash_ledger_settings as settings
    where settings.workspace_id = v_workspace_id;
  if v_ledger_start_date is null then raise exception '입출금 장부 시작일을 먼저 설정해 주세요.'; end if;

  insert into public.cash_ledger_parties (workspace_id, name, note, source_key) values (
    v_workspace_id, v_party_name, v_party_note, v_party_source_key
  ) on conflict on constraint cash_ledger_parties_workspace_source_key_key do nothing;
  select party.id into v_party_id from public.cash_ledger_parties as party
    where party.workspace_id = v_workspace_id and party.source_key = v_party_source_key;
  if v_party_id is null then raise exception '비용 거래처를 준비하지 못했습니다.'; end if;

  v_entry_date := greatest(coalesce(v_cost.paid_date, (now() at time zone 'Asia/Seoul')::date), v_ledger_start_date);
  insert into public.cash_ledger_entries (
    workspace_id, kind, title, party_id, course_id, amount, entry_date, note, course_cost_id
  ) values (
    v_workspace_id, 'expense', left(format('%s - %s', v_category_name, v_course_name), 200), v_party_id,
    p_course_id, v_cost.gross_amount, v_entry_date,
    left(format('강의 비용 정산에서 기록한 %s · 비용명 %s', v_category_name, v_cost.name), 4000), p_course_cost_id
  ) on conflict (course_cost_id) where course_cost_id is not null do update set
    kind = excluded.kind, title = excluded.title, party_id = excluded.party_id, course_id = excluded.course_id,
    amount = excluded.amount, entry_date = excluded.entry_date, note = excluded.note
  returning id into v_entry_id;
  return v_entry_id;
end;
$$;

revoke all on function public.record_course_ad_operation_ledger_expense(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_course_ad_operation_ledger_expense(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
