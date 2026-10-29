-- Calculated YouTube costs are ready to be reflected in the final settlement.
-- Older UI versions saved them as PLANNED, which excluded their details and totals.
update public.course_costs
set status = 'PAID',
    paid_date = coalesce(paid_date, (now() at time zone 'Asia/Seoul')::date),
    updated_at = now()
where status = 'PLANNED'
  and deleted_at is null
  and include_in_settlement
  and calculation_details->>'kind' in ('YOUTUBE_RS', 'YOUTUBE_APPEARANCE_FEE');
