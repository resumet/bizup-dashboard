-- Manually maintained channel information is stored outside analyzer JSON so
-- refreshing YouTube statistics never overwrites it.
alter table public.youtube_analyzed_channels
  add column if not exists category text,
  add column if not exists appearance_fee bigint,
  add column if not exists rs_percent numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.youtube_analyzed_channels'::regclass
      and conname = 'youtube_analyzed_channels_category_valid'
  ) then
    alter table public.youtube_analyzed_channels
      add constraint youtube_analyzed_channels_category_valid
      check (category is null or category in (
        '타이탄 외부채널', '타이탄 내부채널',
        'N잡 연구소 내부채널', 'N잡 연구소 협력채널',
        '휴먼스토리 산하채널', '레드락', '마브스쿨', 'N잡연구소',
        '인베이더스쿨', '쇼츠아재', '하이퍼클래스', '서과장쪽', '하이클래스'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.youtube_analyzed_channels'::regclass
      and conname = 'youtube_analyzed_channels_appearance_fee_nonnegative'
  ) then
    alter table public.youtube_analyzed_channels
      add constraint youtube_analyzed_channels_appearance_fee_nonnegative
      check (appearance_fee is null or appearance_fee >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.youtube_analyzed_channels'::regclass
      and conname = 'youtube_analyzed_channels_rs_percent_range'
  ) then
    alter table public.youtube_analyzed_channels
      add constraint youtube_analyzed_channels_rs_percent_range
      check (rs_percent is null or rs_percent between 0 and 100);
  end if;
end;
$$;

notify pgrst, 'reload schema';
