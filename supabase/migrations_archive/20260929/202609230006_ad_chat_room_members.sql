alter table public.ad_performance_dashboard_metrics
  add column if not exists chat_room_members bigint
  check (chat_room_members between 0 and 9007199254740991);

notify pgrst, 'reload schema';
