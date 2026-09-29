alter table public.courses
  add column if not exists free_kakao_room_1_link text not null default '',
  add column if not exists free_kakao_room_2_link text not null default '',
  add column if not exists communication_room_link text not null default '',
  add column if not exists payment_link text not null default '',
  add column if not exists inquiry_link text not null default '',
  add column if not exists curriculum_link text not null default '',
  add column if not exists free_gift_link text not null default '',
  add column if not exists course_viewing_link text not null default '';

