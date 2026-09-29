insert into public.services (key, title, description, icon_name, route, sort_order, is_active)
values (
  'kakao-ad-maker',
  '플친소재 메이커',
  '강의 정보와 참고 이미지를 바탕으로 서로 다른 5개 전략의 홍보소재 생성 프롬프트를 만듭니다.',
  'Palette',
  '/services/kakao-ad-maker',
  80,
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
