-- A manually maintained channel contact must survive later YouTube analysis.
alter table public.youtube_analyzed_channels
  add column if not exists email text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.youtube_analyzed_channels'::regclass
      and conname = 'youtube_analyzed_channels_email_length'
  ) then
    alter table public.youtube_analyzed_channels
      add constraint youtube_analyzed_channels_email_length
      check (email is null or (email = btrim(email) and char_length(email) between 3 and 254));
  end if;
end;
$$;

notify pgrst, 'reload schema';
