alter table public.shared_calendar_meeting_types
  add column color text check (color ~ '^#[0-9A-Fa-f]{6}$');

grant update (color) on public.shared_calendar_meeting_types to authenticated;

create policy shared_calendar_types_admin_color on public.shared_calendar_meeting_types
  for update to authenticated
  using ((select calendar_private.has_access(workspace_id, true)))
  with check ((select calendar_private.has_access(workspace_id, true)));
