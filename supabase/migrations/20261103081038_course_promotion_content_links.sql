alter table public.courses
  add column if not exists pre_blog_link_1 text not null default '',
  add column if not exists pre_blog_link_2 text not null default '';
