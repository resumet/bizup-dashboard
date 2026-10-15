create table public.course_landing_utms (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  channel text not null check (char_length(channel) between 1 and 150 and channel = btrim(channel)),
  referral_code text not null default '' check (char_length(referral_code) <= 200 and referral_code = btrim(referral_code)),
  medium text not null check (char_length(medium) between 1 and 150 and medium = btrim(medium)),
  url text not null check (char_length(url) <= 4000 and url ~* '^https?://[^[:space:]]+$'),
  short_url text not null default '' check (short_url = '' or (char_length(short_url) <= 2000 and short_url ~* '^https?://[^[:space:]]+$')),
  updated_at timestamptz not null default now(),
  unique (course_id, channel, referral_code, medium)
);
alter table public.course_landing_utms enable row level security;
revoke all on public.course_landing_utms from public, anon, authenticated;
grant select on public.course_landing_utms to authenticated;
grant all on public.course_landing_utms to service_role;
create policy course_landing_utms_read on public.course_landing_utms for select to authenticated
using (exists (select 1 from public.courses c where c.id = course_id and (select calendar_private.has_access(c.workspace_id))));

-- Only the authenticated server import path writes. A course lock serializes
-- concurrent imports and makes the reported add/update counts deterministic.
create function public.import_course_landing_utms(p_course_id uuid, p_actor_id uuid, p_rows jsonb, p_file_name text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_workspace uuid;
  v_row jsonb;
  v_added integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_existing public.course_landing_utms%rowtype;
begin
  select workspace_id into v_workspace from public.courses where id = p_course_id for update;
  if v_workspace is null or not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = v_workspace and m.user_id = p_actor_id
  ) then raise exception '강의를 관리할 권한이 없습니다.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'UTM 목록 형식이 올바르지 않습니다.'; end if;
  if jsonb_array_length(p_rows) not between 1 and 2000 or p_file_name is null or char_length(p_file_name) not between 1 and 255 then
    raise exception '파일 또는 UTM 행 수가 올바르지 않습니다.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    group by r->>'channel', r->>'referral_code', r->>'medium' having count(*) > 1
  ) then raise exception '채널·추천 코드·매체가 중복되었습니다.'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) is distinct from 'object' or exists (
      select 1 from unnest(array['channel','referral_code','medium','url','short_url']) k
      where jsonb_typeof(v_row->k) is distinct from 'string'
    ) then raise exception 'UTM 항목 형식이 올바르지 않습니다.'; end if;
    select * into v_existing from public.course_landing_utms
    where course_id = p_course_id and channel = v_row->>'channel'
      and referral_code = v_row->>'referral_code' and medium = v_row->>'medium';
    if v_existing.id is null then
      insert into public.course_landing_utms(course_id,channel,referral_code,medium,url,short_url)
      values(p_course_id,v_row->>'channel',v_row->>'referral_code',v_row->>'medium',v_row->>'url',v_row->>'short_url');
      v_added := v_added + 1;
    elsif v_existing.url is distinct from v_row->>'url' or v_existing.short_url is distinct from v_row->>'short_url' then
      update public.course_landing_utms set url = v_row->>'url', short_url = v_row->>'short_url', updated_at = now() where id = v_existing.id;
      v_updated := v_updated + 1;
    else v_unchanged := v_unchanged + 1;
    end if;
  end loop;
  insert into public.audit_logs(workspace_id,actor_id,event_type,entity_type,entity_id,metadata)
  values(v_workspace,p_actor_id,'course.landing_utms_imported','course',p_course_id,
    jsonb_build_object('fileName',p_file_name,'added',v_added,'updated',v_updated,'unchanged',v_unchanged));
  return jsonb_build_object('added',v_added,'updated',v_updated,'unchanged',v_unchanged);
end;
$$;
revoke all on function public.import_course_landing_utms(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.import_course_landing_utms(uuid,uuid,jsonb,text) to service_role;
