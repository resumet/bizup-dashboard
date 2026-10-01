create table if not exists public.youtube_channel_email_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  email_body text,
  signature_mode text not null default 'gmail_default',
  custom_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint youtube_channel_email_settings_body_length
    check (email_body is null or char_length(email_body) <= 5000),
  constraint youtube_channel_email_settings_signature_mode_valid
    check (signature_mode in ('gmail_default', 'custom')),
  constraint youtube_channel_email_settings_custom_signature_length
    check (custom_signature is null or char_length(custom_signature) <= 2000),
  constraint youtube_channel_email_settings_custom_signature_required
    check (signature_mode <> 'custom' or nullif(btrim(custom_signature), '') is not null)
);

alter table public.youtube_channel_email_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'youtube_channel_email_settings'
      and policyname = 'youtube_channel_email_settings_read'
  ) then
    create policy youtube_channel_email_settings_read
      on public.youtube_channel_email_settings
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.workspace_members member
          where member.workspace_id = youtube_channel_email_settings.workspace_id
            and member.user_id = auth.uid()
        )
      );
  end if;
end
$$;

revoke all on public.youtube_channel_email_settings from anon, authenticated;
grant select on public.youtube_channel_email_settings to authenticated;
grant all on public.youtube_channel_email_settings to service_role;

comment on table public.youtube_channel_email_settings is
  'Workspace-level email body and signature choice used by YouTube channel Gmail compose links.';
comment on column public.youtube_channel_email_settings.signature_mode is
  'gmail_default uses the selected Gmail account default signature; custom appends custom_signature to the saved body.';

notify pgrst, 'reload schema';
