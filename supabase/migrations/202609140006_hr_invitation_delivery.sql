alter table hr.invitations drop constraint invitations_status_check;
alter table hr.invitations add constraint invitations_status_check check(status in ('pending','sending','sent','failed'));
create function public.hr_claim_invitation(p_id uuid) returns jsonb language plpgsql security definer set search_path=hr,pg_temp as $$
declare invitation hr.invitations; existing_id uuid;
begin
  select * into invitation from hr.invitations where id=p_id for update;
  if invitation.id is null then perform hr.fail('PT404','초대 기록이 없습니다.'); end if;
  if invitation.status<>'pending' then return jsonb_build_object('claimed',false,'status',invitation.status); end if;
  if not exists(select 1 from hr.employees where id=invitation.invited_by and active and role='admin') then perform hr.fail('PT403','초대 관리자 권한을 확인해 주세요.'); end if;
  select id into existing_id from auth.users where lower(email)=invitation.email;
  update hr.invitations set status='sending' where id=p_id;
  return jsonb_build_object('claimed',true,'email',invitation.email,'existing_auth_id',existing_id);
end $$;
revoke all on function public.hr_claim_invitation(uuid) from public,anon,authenticated;
grant execute on function public.hr_claim_invitation(uuid) to service_role;
create function public.hr_reconcile_invitation(p_id uuid) returns jsonb language plpgsql security definer set search_path=hr,pg_temp as $$
declare invitation hr.invitations; existing_id uuid;
begin
  select * into invitation from hr.invitations where id=p_id for update;
  if invitation.status='sent' then return jsonb_build_object('status','sent'); end if;
  if invitation.status is distinct from 'sending' then perform hr.fail('PT409','전송 중인 초대만 결과 확인할 수 있습니다.'); end if;
  select id into existing_id from auth.users where lower(email)=invitation.email;
  if existing_id is null then perform hr.fail('PT409','인증 계정이 아직 확인되지 않습니다. 인증 제공자의 전송 기록을 확인해 주세요.'); end if;
  return public.hr_finish_invitation(p_id,existing_id,true);
end $$;
revoke all on function public.hr_reconcile_invitation(uuid) from public,anon,authenticated;
grant execute on function public.hr_reconcile_invitation(uuid) to service_role;
