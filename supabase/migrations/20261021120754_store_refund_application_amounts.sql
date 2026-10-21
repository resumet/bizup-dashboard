alter table public.job_enrollments
  add column refund_fraction text generated always as (
    case
      when normalized_values->>'refundFraction' in ('1/3', '2/3')
        then normalized_values->>'refundFraction'
      else null
    end
  ) stored,
  add column refund_amount numeric(15, 0) generated always as (
    case
      when normalized_values->>'refundAmount' ~ '^[0-9]{1,13}$'
        then (normalized_values->>'refundAmount')::numeric(15, 0)
      else null
    end
  ) stored;

comment on column public.job_enrollments.refund_fraction is
  '환불 신청서에서 선택한 비율. 기존 환불 기록은 null.';

comment on column public.job_enrollments.refund_amount is
  '환불 신청서 결제금액에서 선택 비율로 계산한 원 단위 금액. 기존 환불 기록은 null.';
