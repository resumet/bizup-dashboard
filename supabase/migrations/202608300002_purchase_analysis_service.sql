insert into public.services (key, title, description, icon_name, route, sort_order, is_active)
values (
  'purchase-analysis',
  '주문결제 매출분석',
  '주문결제 엑셀을 강의·상품·광고 유입별로 분석하고 환불과 중복 구매자를 확인합니다.',
  'ShoppingCart',
  '/services/purchase-analysis',
  70,
  true
)
on conflict (key) do update set
  title = excluded.title,
  description = excluded.description,
  icon_name = excluded.icon_name,
  route = excluded.route,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());
