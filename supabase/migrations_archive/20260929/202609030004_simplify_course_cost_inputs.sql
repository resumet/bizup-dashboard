-- 비용 입력 간소화: 부담 주체는 섹션으로 고정하고 모든 비용은 과세·정산반영으로 처리한다.
with legacy_map as (
  select c.id,
    case cost->>'burden'
      when 'INSTRUCTOR' then 'INSTRUCTOR'
      when 'instructor' then 'INSTRUCTOR'
      when 'SHARED' then 'SHARED'
      when 'shared' then 'SHARED'
      else 'COMPANY'
    end as burden_type
  from public.course_costs c
  join public.course_settlement_projects p
    on c.migrated_from like concat('settlement:',p.id,':%')
  cross join lateral jsonb_array_elements(coalesce(p.statement_draft->'costs','[]'::jsonb))
    with ordinality as x(cost,ordinality)
  where c.burden_type = 'UNCLASSIFIED'
    and c.migrated_from = concat('settlement:',p.id,':',coalesce(cost->>'id',ordinality::text))
)
update public.course_costs c
set burden_type = legacy_map.burden_type
from legacy_map
where c.id = legacy_map.id;

update public.course_costs
set burden_type = case when burden_type = 'UNCLASSIFIED' then 'COMPANY' else burden_type end,
    tax_type = 'TAXABLE',
    supply_amount = round(gross_amount::numeric / 1.1)::bigint,
    vat_amount = gross_amount - round(gross_amount::numeric / 1.1)::bigint,
    evidence_required = false,
    evidence_needs_review = false,
    evidence_types = '{}',
    other_evidence_type = '',
    include_in_settlement = true,
    paid_date = case when status = 'PLANNED' then null else paid_date end,
    company_share_rate = case burden_type when 'COMPANY' then 100 when 'UNCLASSIFIED' then 100 when 'SHARED' then company_share_rate else 0 end,
    instructor_share_rate = case burden_type when 'INSTRUCTOR' then 100 when 'SHARED' then 100 - company_share_rate else 0 end,
    company_share_amount = case burden_type
      when 'COMPANY' then gross_amount
      when 'UNCLASSIFIED' then gross_amount
      when 'SHARED' then round(gross_amount::numeric * company_share_rate / 100)::bigint
      else 0
    end,
    instructor_share_amount = gross_amount - case burden_type
      when 'COMPANY' then gross_amount
      when 'UNCLASSIFIED' then gross_amount
      when 'SHARED' then round(gross_amount::numeric * company_share_rate / 100)::bigint
      else 0
    end,
    updated_at = now();

notify pgrst, 'reload schema';
