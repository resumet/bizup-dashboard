-- Notification events are workspace-scoped; read receipts belong to individual accounts.
create table public.media_notifications (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  kind text not null check (kind in ('instagram','youtube_brief','youtube_schedule')),
  title text not null check (char_length(title) <= 400),
  message text not null check (char_length(message) <= 3000),
  href text not null check (href like '/services/%' and char_length(href) <= 500),
  created_at timestamptz not null default now()
);
create index media_notifications_workspace_id_idx on public.media_notifications(workspace_id,id desc);
create index media_notifications_course_idx on public.media_notifications(course_id);
create table public.media_notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id bigint not null references public.media_notifications(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(user_id,notification_id)
);
create index media_notification_reads_notification_idx on public.media_notification_reads(notification_id);
alter table public.media_notifications enable row level security;
alter table public.media_notification_reads enable row level security;
revoke all on public.media_notifications,public.media_notification_reads from public,anon,authenticated;
grant all on public.media_notifications,public.media_notification_reads to service_role;
revoke all on sequence public.media_notifications_id_seq from public,anon,authenticated;
grant usage,select on sequence public.media_notifications_id_seq to service_role;

create function public.media_notification_unread_count(p_workspace_id uuid,p_user_id uuid) returns bigint
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id) then raise exception 'FORBIDDEN'; end if;
  return (select count(*) from public.media_notifications n where n.workspace_id=p_workspace_id and not exists(select 1 from public.media_notification_reads r where r.notification_id=n.id and r.user_id=p_user_id));
end;
$$;

create function public.media_notification_feed(p_workspace_id uuid,p_user_id uuid,p_read boolean default false,p_before_id bigint default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb; unread_count bigint;
begin
  unread_count:=public.media_notification_unread_count(p_workspace_id,p_user_id);
  with candidates as (
    select n.*,r.read_at from public.media_notifications n
    left join public.media_notification_reads r on r.notification_id=n.id and r.user_id=p_user_id
    where n.workspace_id=p_workspace_id and (r.read_at is not null)=p_read and (p_before_id is null or n.id<p_before_id)
    order by n.id desc limit 31
  ), page as (select * from candidates order by id desc limit 30)
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',id::text,'kind',kind,'title',title,'message',message,'href',href,'createdAt',created_at,'readAt',read_at) order by id desc) from page),'[]'::jsonb),
    'hasMore',(select count(*)>30 from candidates),
    'nextCursor',(select min(id)::text from page),'unreadCount',unread_count
  ) into result;
  return result;
end;
$$;

create function public.read_media_notification(p_workspace_id uuid,p_user_id uuid,p_notification_id bigint) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare result timestamptz;
begin
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.media_notifications where id=p_notification_id and workspace_id=p_workspace_id) then raise exception 'NOT_FOUND'; end if;
  insert into public.media_notification_reads(user_id,notification_id) values(p_user_id,p_notification_id) on conflict do nothing;
  select read_at into result from public.media_notification_reads where user_id=p_user_id and notification_id=p_notification_id;
  return result;
end;
$$;

-- Recheck and lock the share token inside the same transaction as the document and notification.
create function public.save_external_instagram_document(p_token text,p_document_id uuid,p_content jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare setting public.course_document_settings; doc public.course_documents; material_title text; course_title text; keep_gate boolean; excerpt text;
begin
  if p_token !~ '^[a-f0-9]{48}$' then raise exception 'NOT_FOUND'; end if;
  select * into setting from public.course_document_settings where external_access_token=p_token for update;
  if not found or not setting.external_edit_enabled then raise exception 'NOT_FOUND'; end if;
  if jsonb_typeof(p_content) <> 'array' then raise exception 'INVALID_CONTENT'; end if;
  select * into doc from public.course_documents where id=p_document_id and course_id=setting.course_id and workspace_id=setting.workspace_id and deleted_at is null for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  select title into material_title from public.course_instagram_materials where course_id=setting.course_id and document_id=p_document_id;
  if nullif(btrim(material_title),'') is null then raise exception 'NOT_FOUND'; end if;
  keep_gate:=doc.lead_gate_enabled and exists(select 1 from jsonb_array_elements(p_content) with ordinality b(value,position) where value->>'id'=doc.lead_gate_after_block_id and position<jsonb_array_length(p_content));
  update public.course_documents set title=material_title,content=p_content,status='draft',published_at=null,
    lead_gate_enabled=keep_gate,lead_gate_after_block_id=case when keep_gate then doc.lead_gate_after_block_id else null end
    where id=doc.id;
  if doc.content is distinct from p_content then
    select left(concat_ws(' · ',instructor_name,name),300) into course_title from public.courses where id=setting.course_id;
    select left(string_agg(value #>> '{}',' '),240) into excerpt from jsonb_path_query(p_content,'strict $.**.text','{}',true) as extracted(value);
    if nullif(excerpt,'') is null then
      select left(string_agg(value->>'content',' '),240) into excerpt from jsonb_array_elements(p_content) where jsonb_typeof(value->'content')='string';
    end if;
    insert into public.media_notifications(workspace_id,course_id,kind,title,message,href)
    values(setting.workspace_id,setting.course_id,'instagram',left(course_title||' · 인스타그램',400),
      left('외부에서 «'||material_title||'» 글을 작성·수정했습니다.'||case when nullif(excerpt,'') is null then '' else E'\n'||excerpt end,3000),
      '/services/instagram-management/documents/'||doc.id::text);
  end if;
  return jsonb_build_object('success',true);
end;
$$;

create or replace function public.update_public_youtube_media(p_token text,p_kind text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare settings public.course_youtube_settings; result jsonb; previous jsonb; appearance public.course_youtube_appearances; course_title text; summary text; changed boolean;
begin
  if p_token !~ '^[a-f0-9]{48}$' or p_kind not in ('brief','schedule') then raise exception 'NOT_FOUND'; end if;
  if p_kind = 'brief' then
    select * into settings from public.course_youtube_settings where brief_token=p_token for update;
    if not found or not settings.brief_enabled then raise exception 'NOT_FOUND'; end if;
    if settings.brief_revision <> (p_payload->>'revision')::integer then raise exception 'CONFLICT'; end if;
    changed:=settings.brief is distinct from p_payload->'brief';
    update public.course_youtube_settings set brief=p_payload->'brief',brief_revision=brief_revision+1,updated_at=now()
      where course_id=settings.course_id returning jsonb_build_object('brief',brief,'revision',brief_revision) into result;
  else
    select * into settings from public.course_youtube_settings where public_token=p_token for update;
    if not found or not settings.public_enabled then raise exception 'NOT_FOUND'; end if;
    select * into appearance from public.course_youtube_appearances where id=(p_payload->>'id')::uuid and course_id=settings.course_id for update;
    previous:=jsonb_build_object('request_status',appearance.request_status,'filming_at',appearance.filming_at,'filming_confirmed',appearance.filming_confirmed,'note',appearance.note,'respondent',appearance.respondent);
    update public.course_youtube_appearances set
      request_status=p_payload->>'request_status',filming_at=nullif(p_payload->>'filming_at','')::timestamptz,
      filming_confirmed=(p_payload->>'filming_confirmed')::boolean,note=p_payload->>'note',respondent=p_payload->>'respondent',revision=revision+1,updated_at=now()
      where id=(p_payload->>'id')::uuid and course_id=settings.course_id and revision=(p_payload->>'revision')::integer
      returning jsonb_build_object('id',id,'revision',revision,'request_status',request_status,'filming_at',filming_at,'filming_confirmed',filming_confirmed,'note',note,'respondent',respondent) into result;
    if result is null then raise exception 'CONFLICT'; end if;
    changed:=previous is distinct from (result-'id'-'revision');
  end if;
  if changed then
    select left(concat_ws(' · ',instructor_name,name),300) into course_title from public.courses where id=settings.course_id;
    if p_kind='brief' then
      select string_agg(label||': '||left(coalesce(p_payload->'brief'->>key,''),140),E'\n' order by position) into summary
      from (values ('basicInfo','기본 정보',1),('topic','강의 소개',2),('studentResults','수강생 성과',3),('strengths','강점',4),('onlineChannels','온라인 채널',5),('previousAppearances','이전 출연',6),('desiredChannels','희망 채널',7),('goals','출연 목표',8),('concept','촬영 컨셉',9),('thumbnail','썸네일',10),('intro','인트로',11),('scenes','필수 장면',12),('outro','마무리 멘트',13),('notes','기타 전달 사항',14)) as fields(key,label,position)
      where coalesce(settings.brief->>key,'') is distinct from coalesce(p_payload->'brief'->>key,'');
      summary:='외부에서 출연 요청기획서를 작성·수정했습니다.'||coalesce(E'\n'||summary,'');
    else
      summary:=appearance.channel_name||' 채널의 출연·촬영 일정이 변경되었습니다.'||E'\n출연여부: '||
        case result->>'request_status' when 'planned' then '요청전' when 'requested' then '요청함' when 'confirmed' then '출연 확정' else '출연 불가' end||
        E'\n촬영확정: '||case when (result->>'filming_confirmed')::boolean then '촬영일정확정' else '일정 협의 중' end||
        E'\n촬영일정: '||coalesce(to_char((result->>'filming_at')::timestamptz at time zone 'Asia/Seoul','YYYY.MM.DD HH24:MI')||' (한국시간)','미정');
    end if;
    insert into public.media_notifications(workspace_id,course_id,kind,title,message,href)
    values(settings.workspace_id,settings.course_id,case when p_kind='brief' then 'youtube_brief' else 'youtube_schedule' end,
      left(course_title||' · 유튜브',400),left(summary,3000),'/services/youtube-management/'||settings.course_id::text||case when p_kind='brief' then '?tab=brief' else '' end);
  end if;
  return result;
end;
$$;
revoke all on function public.update_public_youtube_media(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.update_public_youtube_media(text,text,jsonb) to service_role;

revoke all on function public.media_notification_unread_count(uuid,uuid) from public,anon,authenticated;
grant execute on function public.media_notification_unread_count(uuid,uuid) to service_role;

revoke all on function public.media_notification_feed(uuid,uuid,boolean,bigint) from public,anon,authenticated;
grant execute on function public.media_notification_feed(uuid,uuid,boolean,bigint) to service_role;

revoke all on function public.read_media_notification(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.read_media_notification(uuid,uuid,bigint) to service_role;

revoke all on function public.save_external_instagram_document(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_external_instagram_document(text,uuid,jsonb) to service_role;
