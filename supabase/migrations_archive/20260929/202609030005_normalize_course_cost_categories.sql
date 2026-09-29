-- 기존 비용 원장을 새 기본 항목 체계로 정리한다.
-- 확정된 정산 스냅샷은 과거 정산 기록이므로 변경하지 않는다.

-- 스튜디오 대여비와 PD 인건비는 하나의 항목으로 분류한다.
-- 실제 지출 건의 담당자·정산일·증빙을 잃지 않도록 행은 유지한다.
with targets as materialized (
  select c.id, to_jsonb(c) as before_data
  from public.course_costs c
  where c.deleted_at is null
    and regexp_replace(c.name, '[[:space:]]+', '', 'g') in (
      '스튜디오대여비',
      '진행PD인건비',
      '스튜디오이용비용(+PD)',
      '스튜디오(PD인건비)비용'
    )
    and (c.category_code <> 'STUDIO_PD' or c.name <> '스튜디오 (PD인건비) 비용')
), updated as (
  update public.course_costs c
  set category_code = 'STUDIO_PD',
      name = '스튜디오 (PD인건비) 비용',
      version = c.version + 1,
      updated_at = now()
  from targets t
  where c.id = t.id
  returning c.id, c.course_id, c.updated_by, to_jsonb(c) as after_data, t.before_data
)
insert into public.course_cost_audit_logs (
  course_cost_id, course_id, actor_id, action, before_data, after_data
)
select id, course_id, updated_by, 'MIGRATED', before_data, after_data
from updated;

-- 이미 구글/메타로 구분해 저장한 항목은 코드와 표기만 통일한다.
with targets as materialized (
  select c.id, to_jsonb(c) as before_data,
    case regexp_replace(c.name, '[[:space:]]+', '', 'g')
      when '구글광고비' then 'GOOGLE_AD'
      else 'META_AD'
    end as next_code,
    case regexp_replace(c.name, '[[:space:]]+', '', 'g')
      when '구글광고비' then '구글광고비'
      else '메타광고비'
    end as next_name
  from public.course_costs c
  where c.deleted_at is null
    and regexp_replace(c.name, '[[:space:]]+', '', 'g') in ('구글광고비', '메타광고비')
    and (
      c.category_code <> case regexp_replace(c.name, '[[:space:]]+', '', 'g') when '구글광고비' then 'GOOGLE_AD' else 'META_AD' end
      or c.name <> case regexp_replace(c.name, '[[:space:]]+', '', 'g') when '구글광고비' then '구글광고비' else '메타광고비' end
    )
), updated as (
  update public.course_costs c
  set category_code = t.next_code,
      name = t.next_name,
      version = c.version + 1,
      updated_at = now()
  from targets t
  where c.id = t.id
  returning c.id, c.course_id, c.updated_by, to_jsonb(c) as after_data, t.before_data
)
insert into public.course_cost_audit_logs (
  course_cost_id, course_id, actor_id, action, before_data, after_data
)
select id, course_id, updated_by, 'MIGRATED', before_data, after_data
from updated;

-- 과거의 구분 없는 광고비는 금액과 증빙을 보존한 채 구글광고비로 전환하고,
-- 같은 강의에 편집 가능한 메타광고비 0원 행을 만든다. 임의의 금액 배분은 하지 않는다.
with targets as materialized (
  select c.*, to_jsonb(c) as before_data
  from public.course_costs c
  where c.deleted_at is null
    and regexp_replace(c.name, '[[:space:]]+', '', 'g') in ('광고비', '공동광고비')
), inserted_meta as (
  insert into public.course_costs as c (
    course_id, category_code, name, burden_type, manager_user_id, manager_name,
    gross_amount, supply_amount, vat_amount, tax_type, paid_date, status,
    evidence_required, evidence_needs_review, evidence_types, other_evidence_type,
    company_share_rate, instructor_share_rate, company_share_amount, instructor_share_amount,
    include_in_settlement, note, migrated_from, version,
    created_by, created_at, updated_by, updated_at
  )
  select
    t.course_id, 'META_AD', '메타광고비', t.burden_type, t.manager_user_id, t.manager_name,
    0, 0, 0, 'TAXABLE', t.paid_date, t.status,
    false, false, '{}', '',
    t.company_share_rate, t.instructor_share_rate, 0, 0,
    true, '', concat('category-split-meta:', t.id), 1,
    t.created_by, t.created_at, t.updated_by, now()
  from targets t
  on conflict (migrated_from) do nothing
  returning c.id, c.course_id, c.updated_by, to_jsonb(c) as after_data
), updated_google as (
  update public.course_costs c
  set category_code = 'GOOGLE_AD',
      name = '구글광고비',
      version = c.version + 1,
      updated_at = now()
  from targets t
  where c.id = t.id
  returning c.id, c.course_id, c.updated_by, to_jsonb(c) as after_data, t.before_data
), audited_google as (
  insert into public.course_cost_audit_logs (
    course_cost_id, course_id, actor_id, action, before_data, after_data
  )
  select id, course_id, updated_by, 'MIGRATED', before_data, after_data
  from updated_google
)
insert into public.course_cost_audit_logs (
  course_cost_id, course_id, actor_id, action, after_data
)
select id, course_id, updated_by, 'MIGRATED', after_data
from inserted_meta;

notify pgrst, 'reload schema';
