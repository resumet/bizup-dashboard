-- Supply requests retain the original requester but have an independently managed owner.
alter table public.supply_requests
  add column assignee_id uuid references auth.users(id) on delete set null,
  add column assignee_name text not null default '';

update public.supply_requests
set assignee_id = requester_id,
    assignee_name = requester_name
where assignee_name = '';

alter table public.supply_requests
  add constraint supply_requests_assignee_name_check
  check (char_length(btrim(assignee_name)) between 1 and 100);

create index supply_requests_assignee_idx
  on public.supply_requests (assignee_id, requested_at desc)
  where assignee_id is not null;

-- The notification bell is an administrator work queue. Retire the external
-- Instagram document event and keep only requested operational events.
delete from public.media_notifications where kind = 'instagram';

alter table public.media_notifications
  drop constraint if exists media_notifications_kind_check,
  add constraint media_notifications_kind_check
  check (kind in (
    'youtube_brief', 'youtube_schedule', 'leave_request', 'calendar_event',
    'youtube_channel', 'external_ad_performance', 'supply_request'
  ));

create schema if not exists notification_private;
revoke all on schema notification_private from public, anon, authenticated;

create or replace function notification_private.is_workspace_admin(
  p_workspace_id uuid,
  p_user_id uuid
) returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_user_id
      and member.role in ('super_admin', 'admin')
  );
$$;

revoke all on function notification_private.is_workspace_admin(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.media_notification_unread_count(
  p_workspace_id uuid,
  p_user_id uuid
) returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not notification_private.is_workspace_admin(p_workspace_id, p_user_id) then
    return 0;
  end if;
  return (
    select count(*)
    from public.media_notifications as notification
    where notification.workspace_id = p_workspace_id
      and not exists (
        select 1 from public.media_notification_reads as read
        where read.notification_id = notification.id
          and read.user_id = p_user_id
      )
  );
end;
$$;

create or replace function public.media_notification_feed(
  p_workspace_id uuid,
  p_user_id uuid,
  p_read boolean default false,
  p_before_id bigint default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare result jsonb; unread_count bigint;
begin
  if not notification_private.is_workspace_admin(p_workspace_id, p_user_id) then
    return jsonb_build_object('items', '[]'::jsonb, 'hasMore', false, 'nextCursor', null, 'unreadCount', 0);
  end if;
  unread_count := public.media_notification_unread_count(p_workspace_id, p_user_id);
  with candidates as (
    select notification.*, read.read_at
    from public.media_notifications as notification
    left join public.media_notification_reads as read
      on read.notification_id = notification.id and read.user_id = p_user_id
    where notification.workspace_id = p_workspace_id
      and (read.read_at is not null) = p_read
      and (p_before_id is null or notification.id < p_before_id)
    order by notification.id desc
    limit 31
  ), page as (
    select * from candidates order by id desc limit 30
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id::text, 'kind', kind, 'title', title, 'message', message,
        'href', href, 'createdAt', created_at, 'readAt', read_at
      ) order by id desc) from page
    ), '[]'::jsonb),
    'hasMore', (select count(*) > 30 from candidates),
    'nextCursor', (select min(id)::text from page),
    'unreadCount', unread_count
  ) into result;
  return result;
end;
$$;

create or replace function public.read_media_notification(
  p_workspace_id uuid,
  p_user_id uuid,
  p_notification_id bigint
) returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare result timestamptz;
begin
  if not notification_private.is_workspace_admin(p_workspace_id, p_user_id) then
    raise exception 'FORBIDDEN';
  end if;
  if not exists (
    select 1 from public.media_notifications
    where id = p_notification_id and workspace_id = p_workspace_id
  ) then
    raise exception 'NOT_FOUND';
  end if;
  insert into public.media_notification_reads(user_id, notification_id)
  values (p_user_id, p_notification_id)
  on conflict do nothing;
  select read_at into result
  from public.media_notification_reads
  where user_id = p_user_id and notification_id = p_notification_id;
  return result;
end;
$$;

create or replace function notification_private.notify_admin_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare dashboard public.ad_performance_dashboards;
begin
  if tg_table_name = 'hr_leave_requests' then
    insert into public.media_notifications(workspace_id, kind, title, message, href)
    values (new.workspace_id, 'leave_request', '휴가 신청', '새 휴가 신청이 등록되었습니다.', '/hr/leave');
  elsif tg_table_name = 'shared_calendar_events' then
    insert into public.media_notifications(workspace_id, kind, title, message, href)
    values (
      new.workspace_id, 'calendar_event', '일정 등록',
      left(format('%s · %s', new.title, to_char(new.event_date, 'YYYY.MM.DD')), 3000),
      '/calendar?date=' || new.event_date::text
    );
  elsif tg_table_name = 'youtube_analyzed_channels' then
    insert into public.media_notifications(workspace_id, kind, title, message, href)
    values (
      new.workspace_id, 'youtube_channel', '유튜브 채널 등록',
      left(coalesce(nullif(new.channel->>'title', ''), new.channel_id), 3000),
      '/services/youtube-channels'
    );
  elsif tg_table_name = 'ad_performance_dashboard_metrics' then
    select * into dashboard
    from public.ad_performance_dashboards
    where id = new.dashboard_id and service_scope = 'external_marketing';
    if found then
      insert into public.media_notifications(workspace_id, kind, title, message, href)
      values (
        dashboard.workspace_id, 'external_ad_performance', '외부광고 성과 기록 업데이트',
        to_char(new.metric_date, 'YYYY.MM.DD') || ' 성과 기록이 업데이트되었습니다.',
        '/services/external-marketing/' || dashboard.id::text
      );
    end if;
  elsif tg_table_name = 'supply_requests' then
    insert into public.media_notifications(workspace_id, kind, title, message, href)
    values (
      new.workspace_id, 'supply_request', '비품 구매신청 등록',
      left(new.requester_name || ' · ' || new.item_name, 3000),
      '/admin/supplies'
    );
  end if;
  return new;
end;
$$;

revoke all on function notification_private.notify_admin_event()
  from public, anon, authenticated;

create trigger notify_admin_leave_request
after insert on public.hr_leave_requests
for each row execute function notification_private.notify_admin_event();

create trigger notify_admin_calendar_event
after insert on public.shared_calendar_events
for each row execute function notification_private.notify_admin_event();

create trigger notify_admin_youtube_channel
after insert on public.youtube_analyzed_channels
for each row execute function notification_private.notify_admin_event();

create trigger notify_admin_external_ad_performance
after insert or update on public.ad_performance_dashboard_metrics
for each row execute function notification_private.notify_admin_event();

create trigger notify_admin_supply_request
after insert on public.supply_requests
for each row execute function notification_private.notify_admin_event();

revoke all on function public.media_notification_unread_count(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.media_notification_unread_count(uuid, uuid)
  to service_role;
revoke all on function public.media_notification_feed(uuid, uuid, boolean, bigint)
  from public, anon, authenticated;
grant execute on function public.media_notification_feed(uuid, uuid, boolean, bigint)
  to service_role;
revoke all on function public.read_media_notification(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.read_media_notification(uuid, uuid, bigint)
  to service_role;

notify pgrst, 'reload schema';
