alter table public.courses
  add column if not exists paid_kakao_room_link text not null default '';

notify pgrst, 'reload schema';
