insert into public.services (
  service_key,
  title,
  description,
  icon,
  route,
  status,
  display_order
)
values (
  'settlement-analysis',
  '매출정산 정보확인',
  '정산 엑셀을 강사·강의·결제수단별로 분석하고 중복 구매자와 매출 추이를 확인합니다.',
  'hand-coins',
  '/services/settlement-analysis',
  'active',
  40
)
on conflict (service_key) do update set
  title = excluded.title,
  description = excluded.description,
  icon = excluded.icon,
  route = excluded.route,
  status = excluded.status,
  display_order = excluded.display_order;
