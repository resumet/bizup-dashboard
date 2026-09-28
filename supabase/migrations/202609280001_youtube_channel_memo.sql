-- Keep internal channel notes separate from analyzer output so reanalysis retains them.
alter table public.youtube_analyzed_channels
  add column if not exists memo text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.youtube_analyzed_channels'::regclass
      and conname = 'youtube_analyzed_channels_memo_length'
  ) then
    alter table public.youtube_analyzed_channels
      add constraint youtube_analyzed_channels_memo_length
      check (memo is null or char_length(memo) <= 2000);
  end if;
end;
$$;

notify pgrst, 'reload schema';
