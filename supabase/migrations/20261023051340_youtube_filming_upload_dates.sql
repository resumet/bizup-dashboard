-- Store YouTube filming and upload schedules as calendar-only dates.
-- Keep filming_at synchronized during the rollout so older application versions
-- continue to satisfy the existing constraint until the new code is deployed.
alter table public.course_youtube_appearances
  add column filming_date date,
  add column upload_date date;

update public.course_youtube_appearances
set filming_date = (filming_at at time zone 'Asia/Seoul')::date
where filming_at is not null
  and request_status = 'confirmed';

update public.course_youtube_appearances
set filming_confirmed = false,
    filming_at = null,
    filming_date = null,
    upload_date = null
where request_status <> 'confirmed'
  and (filming_confirmed or filming_at is not null);

comment on column public.course_youtube_appearances.filming_date is 'YouTube filming calendar date in Asia/Seoul';
comment on column public.course_youtube_appearances.upload_date is 'Planned YouTube upload calendar date in Asia/Seoul';

create or replace function course_media_private.sync_youtube_schedule_dates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.request_status <> 'confirmed' then
    new.filming_confirmed := false;
    new.filming_at := null;
    new.filming_date := null;
    new.upload_date := null;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.filming_date is null and new.filming_at is not null then
      new.filming_date := (new.filming_at at time zone 'Asia/Seoul')::date;
    end if;
  elsif new.filming_at is distinct from old.filming_at
    and new.filming_date is not distinct from old.filming_date then
    new.filming_date := case
      when new.filming_at is null then null
      else (new.filming_at at time zone 'Asia/Seoul')::date
    end;
  end if;

  if new.filming_confirmed and new.filming_date is null and new.filming_at is not null then
    new.filming_date := (new.filming_at at time zone 'Asia/Seoul')::date;
  end if;

  return new;
end;
$$;

revoke all on function course_media_private.sync_youtube_schedule_dates() from public, anon, authenticated;

create trigger sync_youtube_schedule_dates
before insert or update of request_status, filming_at, filming_date, upload_date, filming_confirmed
on public.course_youtube_appearances
for each row execute function course_media_private.sync_youtube_schedule_dates();

alter table public.course_youtube_appearances
  add constraint youtube_filming_date_requires_confirmed_appearance
    check (filming_date is null or (request_status = 'confirmed' and filming_confirmed)),
  add constraint youtube_upload_date_requires_confirmed_appearance
    check (upload_date is null or request_status = 'confirmed'),
  add constraint youtube_confirmed_filming_requires_calendar_date
    check (not filming_confirmed or filming_date is not null);

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
    if p_payload->>'request_status' not in ('confirmed','declined') then raise exception 'INVALID_STATUS'; end if;
    select * into appearance from public.course_youtube_appearances where id=(p_payload->>'id')::uuid and course_id=settings.course_id and not is_internal for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    previous:=jsonb_build_object('video_url',appearance.video_url,'request_status',appearance.request_status,'filming_date',appearance.filming_date,'upload_date',appearance.upload_date,'filming_confirmed',appearance.filming_confirmed,'note',appearance.note,'respondent',appearance.respondent);
    update public.course_youtube_appearances set
      video_url=case when p_payload ? 'video_url' then p_payload->>'video_url' else video_url end,
      request_status=p_payload->>'request_status',
      filming_date=nullif(p_payload->>'filming_date','')::date,
      filming_at=case when nullif(p_payload->>'filming_date','') is null then null else (nullif(p_payload->>'filming_date','')::date::timestamp at time zone 'Asia/Seoul') end,
      upload_date=nullif(p_payload->>'upload_date','')::date,
      filming_confirmed=(p_payload->>'filming_confirmed')::boolean,note=p_payload->>'note',respondent=p_payload->>'respondent',revision=revision+1,updated_at=now()
      where id=(p_payload->>'id')::uuid and course_id=settings.course_id and revision=(p_payload->>'revision')::integer
      returning jsonb_build_object('id',id,'revision',revision,'video_url',video_url,'request_status',request_status,'filming_date',filming_date,'upload_date',upload_date,'filming_confirmed',filming_confirmed,'note',note,'respondent',respondent) into result;
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
      summary:=appearance.channel_name||' 채널의 출연·촬영·업로드 일정이 변경되었습니다.'||E'\n출연여부: '||
        case result->>'request_status' when 'planned' then '요청전' when 'requested' then '요청함' when 'confirmed' then '출연 확정' else '출연 불가' end||
        E'\n촬영확정: '||case when (result->>'filming_confirmed')::boolean then '촬영일정확정' else '일정 협의 중' end||
        E'\n촬영일정: '||coalesce(to_char((result->>'filming_date')::date,'YYYY.MM.DD'),'미정')||
        E'\n업로드 일정: '||coalesce(to_char((result->>'upload_date')::date,'YYYY.MM.DD'),'미정');
      if appearance.video_url is distinct from result->>'video_url' then
        summary:=summary||E'\n게시된 영상: '||case when nullif(result->>'video_url','') is null then '주소 삭제' else left(result->>'video_url',1000) end;
      end if;
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

notify pgrst, 'reload schema';
