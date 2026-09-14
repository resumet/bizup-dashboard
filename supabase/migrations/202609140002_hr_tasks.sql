create function hr.text_value(p jsonb,k text,min_len integer,max_len integer) returns text language plpgsql immutable as $$
declare v text := btrim(coalesce(p->>k,''));
begin
  if jsonb_typeof(p->k) not in ('string','null') or length(v)<min_len or length(v)>max_len then
    perform hr.fail('PT400',k||': '||min_len||'~'||max_len||'자로 입력해 주세요.');
  end if;
  return v;
end $$;
create function hr.only_keys(p jsonb,keys text[]) returns void language plpgsql immutable as $$
begin
  if jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k where not k=any(keys)) then perform hr.fail('PT400','허용되지 않은 입력 필드입니다.'); end if;
end $$;
create function hr.assert_version(actual integer,p jsonb) returns void language plpgsql immutable as $$
begin if actual is distinct from (p->>'expected_version')::integer then perform hr.fail('PT409','다른 변경이 먼저 저장되었습니다. 최신 내용을 다시 불러와 확인해 주세요.'); end if; end $$;

create function hr.task_command(e hr.employees,action text,p jsonb) returns jsonb language plpgsql as $$
declare t hr.tasks; old_t hr.tasks; target uuid; watchers uuid[]; added uuid[]; reason text; comment_id uuid; new_status text;
begin
  if action='task.create' then
    perform hr.only_keys(p,array['title','description','assignee_id','watcher_ids','planned_date']);
    target := coalesce((p->>'assignee_id')::uuid,e.id);
    watchers := array(select distinct value::uuid from jsonb_array_elements_text(coalesce(p->'watcher_ids','[]')) where value::uuid<>target);
    perform hr.employee_check(e.organization_id,watchers||target);
    insert into hr.tasks(organization_id,title,description,creator_id,assignee_id,watcher_ids,planned_date)
    values(e.organization_id,hr.text_value(p,'title',1,150),hr.text_value(p,'description',0,10000),e.id,target,watchers,coalesce((p->>'planned_date')::date,hr.today())) returning * into t;
    insert into hr.task_events(task_id,actor_id,event_type,after_data,task_version) values(t.id,e.id,'created',to_jsonb(t),t.version);
    perform hr.emit(e.organization_id,t.id||':assigned:1','task.assigned',t.id,e.id,array[target]);
    perform hr.emit(e.organization_id,t.id||':watchers:1','task.watcher',t.id,e.id,watchers);
  else
    select * into t from hr.tasks where id=(p->>'id')::uuid and organization_id=e.organization_id for update;
    if t.id is null or not hr.can_read(t,e) then perform hr.fail('PT404','업무를 찾을 수 없습니다.'); end if;
    old_t := t;
    if action='task.comment' then
      perform hr.only_keys(p,array['id','body']);
      reason := hr.text_value(p,'body',1,10000);
      insert into hr.comments(task_id,author_id,body) values(t.id,e.id,reason) returning id into comment_id;
      insert into hr.task_events(task_id,actor_id,event_type,reason,task_version) values(t.id,e.id,'comment',reason,t.version);
      perform hr.emit(e.organization_id,comment_id||':comment','task.comment',t.id,e.id,t.watcher_ids||array[t.creator_id,t.assignee_id]);
      return jsonb_build_object('id',comment_id);
    end if;
    perform hr.assert_version(t.version,p);
    if action='task.update' then
      perform hr.only_keys(p,array['id','expected_version','title','description','planned_date','watcher_ids']);
      if e.role<>'admin' and e.id not in(t.creator_id,t.assignee_id) then perform hr.fail('PT403','작성자 또는 현재 담당자만 수정할 수 있습니다.'); end if;
      watchers := case when p ? 'watcher_ids' then array(select distinct value::uuid from jsonb_array_elements_text(p->'watcher_ids') where value::uuid<>t.assignee_id) else t.watcher_ids end;
      added := array(select x from unnest(watchers) x where not x=any(t.watcher_ids));
      perform hr.employee_check(e.organization_id,added);
      update hr.tasks set title=case when p?'title' then hr.text_value(p,'title',1,150) else title end,
        description=case when p?'description' then hr.text_value(p,'description',0,10000) else description end,
        planned_date=coalesce((p->>'planned_date')::date,planned_date),watcher_ids=watchers,version=version+1,updated_at=now()
      where id=t.id returning * into t;
      perform hr.emit(e.organization_id,t.id||':watchers:'||t.version,'task.watcher',t.id,e.id,added);
    elsif action='task.status' then
      perform hr.only_keys(p,array['id','expected_version','status','reason']);
      if e.role<>'admin' and e.id<>t.assignee_id then perform hr.fail('PT403','현재 담당자 또는 관리자만 상태를 바꿀 수 있습니다.'); end if;
      new_status := p->>'status';
      if new_status is null or new_status not in ('ready','doing','done','cancelled') or new_status=t.status or (t.status in ('done','cancelled') and new_status in ('done','cancelled')) then perform hr.fail('PT400','허용되지 않는 상태 전환입니다.'); end if;
      reason := hr.text_value(p,'reason',case when new_status='cancelled' or t.status in ('done','cancelled') then 1 else 0 end,1000);
      update hr.tasks set status=new_status,completed_at=case when new_status='done' then now() end,
        cancelled_at=case when new_status='cancelled' then now() end,version=version+1,updated_at=now() where id=t.id returning * into t;
      perform hr.emit(e.organization_id,t.id||':status:'||t.version,'task.status',t.id,e.id,t.watcher_ids||array[t.creator_id,t.assignee_id]);
    elsif action='task.transfer' then
      perform hr.only_keys(p,array['id','expected_version','new_assignee_id','handover_note']);
      if e.role<>'admin' and e.id<>t.assignee_id then perform hr.fail('PT403','현재 담당자 또는 관리자만 이관할 수 있습니다.'); end if;
      target := (p->>'new_assignee_id')::uuid;
      if target is null or target=t.assignee_id or t.status in ('done','cancelled') then perform hr.fail('PT400','진행할 업무를 다른 활성 직원에게 이관해 주세요. 완료·취소 업무는 먼저 재개해 주세요.'); end if;
      perform hr.employee_check(e.organization_id,array[target]);
      reason := hr.text_value(p,'handover_note',1,2000);
      watchers := array(select distinct x from unnest(t.watcher_ids||t.assignee_id) x where x<>target);
      update hr.tasks set assignee_id=target,watcher_ids=watchers,version=version+1,updated_at=now() where id=t.id returning * into t;
      perform hr.emit(e.organization_id,t.id||':transfer:'||t.version,'task.transfer',t.id,e.id,t.watcher_ids||array[t.creator_id,t.assignee_id]);
    else perform hr.fail('PT400','지원하지 않는 업무 명령입니다.'); end if;
    insert into hr.task_events(task_id,actor_id,event_type,before_data,after_data,reason,task_version)
    values(t.id,e.id,action,to_jsonb(old_t),to_jsonb(t),coalesce(reason,''),t.version);
  end if;
  perform hr.log(e,'task',t.id,action,case when old_t.id is not null then to_jsonb(old_t) end,to_jsonb(t),coalesce(reason,''));
  return to_jsonb(t);
end $$;

create function hr.today_tasks(e hr.employees,d date) returns setof hr.tasks language sql stable as $$
  with selected_ids as (
    select t.id from hr.tasks t where t.organization_id=e.organization_id and t.assignee_id=e.id
      and ((t.planned_date<=d and t.status in ('ready','doing')) or t.planned_date=d)
    union
    select x.task_id from hr.task_events x where x.actor_id=e.id and x.created_at>=hr.at_day(d,0) and x.created_at<hr.at_day(d+1,0)
  )
  select t.* from selected_ids selected join hr.tasks t on t.id=selected.id where t.organization_id=e.organization_id and hr.can_read(t,e) order by t.updated_at desc
$$;

create function hr.review_command(e hr.employees,p jsonb) returns jsonb language plpgsql as $$
declare d date := (p->>'work_date')::date; r hr.reviews; t hr.tasks; item jsonb; snapshots jsonb := '[]'; revision hr.review_revisions; seen uuid[] := '{}';
begin
  perform hr.only_keys(p,array['work_date','expected_version','note','items']);
  if d is null or d>hr.today() or d<e.employment_start_date then perform hr.fail('PT400','재직 기간 내 오늘 또는 과거 근무일을 선택해 주세요.'); end if;
  if jsonb_typeof(p->'items') is distinct from 'array' then perform hr.fail('PT400','정리할 업무 목록을 확인해 주세요.'); end if;
  insert into hr.reviews(organization_id,employee_id,work_date) values(e.organization_id,e.id,d) on conflict(employee_id,work_date) do nothing;
  select * into r from hr.reviews where employee_id=e.id and work_date=d for update;
  perform hr.assert_version(r.latest_revision,p);
  for item in select * from jsonb_array_elements(p->'items') loop
    select * into t from hr.tasks where id=(item->>'id')::uuid;
    if t.id is null or not hr.can_read(t,e) then perform hr.fail('PT404','조회할 수 없는 업무가 포함되어 있습니다. 목록을 새로고침해 주세요.'); end if;
    if t.id=any(seen) then perform hr.fail('PT400','같은 업무를 여러 번 정리할 수 없습니다.'); end if;
    perform hr.assert_version(t.version,item);
    seen := seen||t.id;
    snapshots := snapshots||jsonb_build_array(jsonb_build_object('id',t.id,'task_number',t.task_number,'title',t.title,'status',t.status,'version',t.version,
      'assignee_id',t.assignee_id,'assignee_name',(select name from hr.employees where id=t.assignee_id),'submitted_by',e.id,'work_note',hr.text_value(item,'work_note',0,3000)));
  end loop;
  insert into hr.review_revisions(review_id,revision,note,items,late) values(r.id,r.latest_revision+1,hr.text_value(p,'note',0,3000),snapshots,
    d<hr.today() or exists(select 1 from hr.attendance where employee_id=e.id and work_date=d and check_out_at is not null)) returning * into revision;
  update hr.reviews set latest_revision=revision.revision,submitted_at=revision.submitted_at where id=r.id;
  return to_jsonb(revision);
end $$;
revoke all on all functions in schema hr from public,anon,authenticated;
