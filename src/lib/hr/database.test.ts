import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

export async function createHrDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  for (const file of (await readdir("supabase/migrations")).filter((name) => /^20260914\d+_hr_/.test(name)).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  return db;
}

test("HR migrations install in PostgreSQL and private tables reject direct client access", async () => {
  const db = await createHrDatabase();
  try {
    await assert.rejects(db.query("select public.hr_bootstrap(null,'Installation check','2020-01-01')"), /인증 계정을 먼저/);
    assert.equal((await db.query<{ count: number }>("select count(*)::int from hr.organizations")).rows[0].count, 0);
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select * from hr.employees"), /permission denied/);
    await assert.rejects(db.query("select hr.me()"), /permission denied/);
    await assert.rejects(db.query("select public.hr_bootstrap(null,'test',current_date)"), /permission denied/);
  } finally { await db.close(); }
});

test("HR domain commands enforce access, versions, idempotency and preserve transaction history", async (suite) => {
  const db = await createHrDatabase();
  const auth = Array.from({ length: 5 }, () => randomUUID());
  let org: string;
  let admin: string;
  let alice: string;
  let bob: string;
  let cara: string;
  const owner = async () => { await db.exec("reset role"); };
  const as = async (index: number) => {
    await owner(); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [auth[index]]); await db.exec("set role authenticated");
  };
  const command = async (action: string, body: Record<string, unknown>, key = randomUUID()) => (await db.query<{ result: Record<string, unknown> }>("select public.hr_command($1,$2::jsonb,$3::uuid) result", [action, JSON.stringify(body), key])).rows[0].result;
  const query = async (resource: string, filter: Record<string, unknown> = {}) => (await db.query<{ result: Record<string, unknown> }>("select public.hr_query($1,$2::jsonb) result", [resource, JSON.stringify(filter)])).rows[0].result;
  const scalar = async (sql: string) => Object.values((await db.query<Record<string, unknown>>(sql)).rows[0])[0];
  try {
    for (let i = 0; i < auth.length; i++) await db.query("insert into auth.users(id,email) values($1,$2)", [auth[i], `hr${i}@example.test`]);
    org = (await db.query<{ id: string }>("select public.hr_bootstrap($1,'관리자','2020-01-01') id", [auth[0]])).rows[0].id;
    admin = String(await scalar("select id from hr.employees where role='admin'"));
    const ids: string[] = [];
    for (let i = 1; i <= 3; i++) ids.push((await db.query<{ id: string }>("insert into hr.employees(organization_id,auth_id,email,name,department,employment_start_date) values($1,$2,$3,$4,'운영','2020-01-01') returning id", [org, auth[i], `hr${i}@example.test`, ['','Alice','Bob','Cara'][i]])).rows[0].id);
    [alice,bob,cara] = ids;
    const today = String(await scalar("select hr.today()::text"));
    const tomorrow = String(await scalar("select (hr.today()+1)::text"));
    const monday = String(await scalar("select (hr.today()+(8-extract(isodow from hr.today())::integer))::text"));
    let task: Record<string, unknown>;
    await suite.test("outsiders cannot enter; directory exposes only selection fields", async () => {
      await as(4); await assert.rejects(query("context"), /HR 이용 권한/);
      await as(1); const directory = await query("directory");
      const people = directory.items as Record<string, unknown>[];
      assert.equal(people.length,4); assert.deepEqual(Object.keys(people[0]).sort(),['department','id','name']);
      await assert.rejects(query("admin"),/관리자/);
    });
    await suite.test("assignment, watchers, immutable ID, conflict and transfer are atomic", async () => {
      await as(1);
      const key = randomUUID(); const body = { title: "업무 A", assignee_id: bob, watcher_ids: [cara,cara,bob], planned_date: tomorrow };
      task = await command("task.create",body,key);
      assert.equal(task.assignee_id,bob); assert.deepEqual(task.watcher_ids,[cara]);
      assert.deepEqual(await command("task.create",body,key),task);
      await assert.rejects(command("task.create",{...body,title:"다름"},key),/요청 식별자/);
      await assert.rejects(command("task.update",{id:task.id,expected_version:1,assignee_id:alice}),/허용되지 않은/);
      await as(3); await assert.rejects(command("task.status",{id:task.id,expected_version:1,status:'doing'}),/현재 담당자/);
      await command("task.comment",{id:task.id,body:'참조 댓글'});
      await as(2);
      task = await command("task.status",{id:task.id,expected_version:1,status:'doing'});
      await assert.rejects(command("task.update",{id:task.id,expected_version:1,title:'충돌'}),/다른 변경/);
      const taskId = task.id;
      task = await command("task.transfer",{id:task.id,expected_version:2,new_assignee_id:alice,handover_note:'다음 할 일: 검토'});
      assert.equal(task.id,taskId); assert.equal(task.status,'doing'); assert.equal(task.assignee_id,alice);
      assert.ok((task.watcher_ids as string[]).includes(bob));
      await assert.rejects(command("task.status",{id:task.id,expected_version:3,status:'done'}),/현재 담당자/);
      await as(1);
      const detail=await query("task",{id:task.id}); assert.equal((detail.comments as unknown[]).length,1);
      task=await command("task.update",{id:task.id,expected_version:3,watcher_ids:[]});
      await as(3); await assert.rejects(query("task",{id:task.id}),/업무를 찾을/);
      await as(1); await assert.rejects(command("task.status",{id:task.id,expected_version:4,status:'cancelled'}),/reason/);
      task=await command("task.status",{id:task.id,expected_version:4,status:'done'});
      await assert.rejects(command("task.status",{id:task.id,expected_version:5,status:'cancelled',reason:'x'}),/허용되지 않는/);
      task=await command("task.status",{id:task.id,expected_version:5,status:'doing',reason:'추가 검토'});
      assert.equal(task.completed_at,null);
      const nextDay=(await query('today',{date:tomorrow})).tasks as Record<string,unknown>[];
      assert.ok(nextDay.some(item=>item.id===task.id));
      const later=String(await scalar("select (current_date+3)::text"));
      const laterTasks=(await query('today',{date:later})).tasks as Record<string,unknown>[];
      assert.equal(laterTasks.filter(item=>item.id===task.id).length,1);
    });
    await suite.test("server-clock attendance is idempotent and review snapshots survive later edits", async () => {
      await as(1);
      const attendance=await command("attendance.in",{});
      assert.deepEqual(await command("attendance.in",{}),attendance);
      await assert.rejects(command("attendance.in",{employee_id:bob}),/허용되지 않은/);
      const first=await command("review.submit",{work_date:today,expected_version:0,note:'진행중 그대로 정리',items:[{id:task.id,expected_version:task.version}]});
      const out=await command("attendance.out",{id:attendance.id,expected_version:attendance.version});
      assert.deepEqual(await command("attendance.out",{id:attendance.id,expected_version:attendance.version}),out);
      task=await command("task.update",{id:task.id,expected_version:task.version,title:'수정된 업무'});
      const second=await command("review.submit",{work_date:today,expected_version:1,note:'퇴근 후 정리',items:[{id:task.id,expected_version:task.version}]});
      assert.equal(second.late,true); assert.equal(first.revision,1); assert.equal(second.revision,2);
      const records=await query("records",{from:today,to:today});
      const revisions=records.reviews as Record<string, unknown>[];
      assert.equal(revisions.length,2); assert.equal((revisions[1].items as Record<string,unknown>[])[0].title,'업무 A');
      await as(2); await assert.rejects(query("records",{employee_id:alice}),/다른 직원/);
      const a=await command("attendance.in",{}); await command("attendance.out",{id:a.id,expected_version:a.version});
      const summary=(await query("today")).summary as Record<string,unknown>; assert.equal(summary.review_missing,true);
    });
    await suite.test("leave segment constraints, private calendar, versions and cancellation", async () => {
      await as(1);
      const preview=await query('leave.preview',{start_date:monday,end_date:monday,unit:'am'}); assert.equal(preview.units,0.5);
      const leave=await command('leave.create',{start_date:monday,end_date:monday,unit:'am',private_reason:'민감한 개인 사유'});
      await assert.rejects(command('leave.create',{start_date:monday,end_date:monday,unit:'full'}),/겹칩니다/);
      const afternoon=await command('leave.create',{start_date:monday,end_date:monday,unit:'pm'});
      assert.equal((await query('leaves',{from:monday,to:monday})).planned,1);
      await as(2);
      const calendar=await query('calendar',{from:monday,to:monday}); assert.equal((calendar.items as unknown[]).length,2);
      assert.ok(!(calendar.items as Record<string,unknown>[]).some(x=>'private_reason' in x));
      await assert.rejects(command('leave.cancel',{id:leave.id,expected_version:1,reason:'삭제'}),/휴가를 찾을/);
      await as(1);
      await command('leave.cancel',{id:afternoon.id,expected_version:1,reason:'일정 변경'});
      assert.equal((await query('leaves',{from:monday,to:monday})).planned,0.5);
      await as(0); await assert.rejects(command('leave.create',{employee_id:bob,start_date:monday,end_date:monday,unit:'am'}),/admin_reason/);
    });
    await suite.test("policy preview, exact impact approval and future leave recalculation", async () => {
      await as(0);
      const policies=(await query('policies')).items as Record<string,unknown>[];
      const config={...(policies[0].config as object),holidays:[{date:monday,name:'임시 휴무'}]};
      const preview=await command('policy.preview',{effective_from:tomorrow,expected_version:1,config});
      assert.equal((preview.impact as unknown[]).length,1);
      await assert.rejects(command('policy.save',{effective_from:tomorrow,expected_version:1,config,confirm_impact:[]}),/미리보기/);
      const saved=await command('policy.save',{effective_from:tomorrow,expected_version:1,config,confirm_impact:preview.impact});
      assert.ok(saved.policy);
      await as(1); assert.equal((await query('leaves',{from:monday,to:monday})).planned,0);
      await as(0); await assert.rejects(command('policy.preview',{effective_from:today,expected_version:2,config}),/내일/);
      const revisedConfig={...config,grace:5};
      const nextPreview=await command('policy.preview',{effective_from:tomorrow,expected_version:2,config:revisedConfig});
      const revision=await command('policy.save',{effective_from:tomorrow,expected_version:2,config:revisedConfig,confirm_impact:nextPreview.impact});
      assert.equal((revision.policy as {version:number}).version,3);
    });
    await suite.test("corrections preserve raw values; stale requests cannot overwrite changed records", async () => {
      await owner();
      const day=String(await scalar("select (hr.today()-2)::text"));
      const start=String(await scalar("select hr.at_day(hr.today()-2,540)::text"));
      const end=String(await scalar("select hr.at_day(hr.today()-2,1080)::text"));
      await as(1); const req=await command('correction.request',{work_date:day,check_in_at:start,check_out_at:end,reason:'누락'});
      await as(0);
      await command('correction.direct',{employee_id:alice,work_date:day,check_in_at:start,check_out_at:end,expected_version:0,reason:'직접 정정'});
      await assert.rejects(command('correction.resolve',{id:req.id,decision:'applied',reason:'검토'}),/요청 후 근태가 변경/);
      await command('correction.resolve',{id:req.id,decision:'rejected',reason:'직접 반영 완료'});
      await as(1); const records=await query('records',{from:day,to:day});
      assert.equal((records.audit as unknown[]).length,1);
      assert.equal(((records.days as Record<string,unknown>[])[0]).reference_minutes,480);
    });
    await suite.test("outbox retries deliver once and hide task links after permission removal", async () => {
      await owner(); await db.exec("set role service_role");
      await db.query('select public.hr_process_notifications(500)'); await db.query('select public.hr_process_notifications(500)');
      await owner(); assert.equal(await scalar('select count(*) from (select event_id,recipient_id from hr.notifications group by 1,2 having count(*)>1) d'),0);
      await as(3); const notifications=await query('notifications');
      const hidden=(notifications.items as Record<string,unknown>[]).filter(n=>String(n.event_type).startsWith('task.'));
      assert.ok(hidden.length>0); assert.ok(hidden.every(n=>n.entity_id===null));
      await as(1); const otherId=String((notifications.items as Record<string,unknown>[])[0].id);
      await assert.rejects(command('notification.read',{id:otherId}),/알림을 찾을/);
    });
    await suite.test("last administrator and unfinished assignee cannot be deactivated", async () => {
      await as(0);
      await assert.rejects(command('employee.update',{id:admin,expected_version:1,active:false,reason:'x'}),/마지막 활성 관리자/);
      await assert.rejects(command('employee.update',{id:alice,expected_version:1,active:false,reason:'x'}),/미완료 담당 업무/);
      await command('employee.update',{id:cara,expected_version:1,active:false,reason:'퇴사'});
      await as(3); await assert.rejects(query('context'),/HR 이용 권한/);
      await as(1); await assert.rejects(command('task.transfer',{id:task.id,expected_version:task.version,new_assignee_id:cara,handover_note:'인계'}),/활성 직원/);
      await as(0); const dashboard=await query('admin');
      const counts=dashboard.counts as Record<string,number>;
      assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),dashboard.people_total);
    });
    await suite.test("cross-organization IDs never grant task or employee access", async () => {
      await owner();
      const otherOrg=String(await scalar("insert into hr.organizations(name) values('다른 조직') returning id"));
      const outsider=(await db.query<{id:string}>("insert into hr.employees(organization_id,auth_id,email,name,employment_start_date) values($1,$2,'outside@example.test','외부 직원','2020-01-01') returning id",[otherOrg,auth[4]])).rows[0].id;
      await as(4); await assert.rejects(query('task',{id:task.id}),/업무를 찾을/);
      assert.equal((await query('tasks',{status:'all'})).total,0);
      await as(1); await assert.rejects(command('task.transfer',{id:task.id,expected_version:task.version,new_assignee_id:outsider,handover_note:'교차 조직'}),/활성 직원/);
      await as(0); await assert.rejects(query('records',{employee_id:outsider}),/직원을 찾을/);
    });
    await suite.test("notification worker failure preserves domain data and retries exactly once", async () => {
      await owner();
      await db.exec(`create function hr.test_fail_notification() returns trigger language plpgsql as $$ begin raise exception 'injected outage'; end $$;
        create trigger test_notification_failure before insert on hr.notifications for each row execute function hr.test_fail_notification();`);
      await as(1); const newTask=await command('task.create',{title:'알림 장애 중 배정',assignee_id:bob});
      await owner(); await db.exec('set role service_role');
      const result=await scalar('select public.hr_process_notifications(500)'); assert.ok((result as {failed:number}).failed>0);
      await owner(); assert.equal((await db.query('select id from hr.tasks where id=$1',[newTask.id])).rows.length,1);
      assert.ok(Number(await scalar("select count(*) from hr.outbox where processed_at is null and attempts>0"))>0);
      await db.exec("drop trigger test_notification_failure on hr.notifications; drop function hr.test_fail_notification(); update hr.outbox set next_retry_at=now() where processed_at is null;");
      await db.exec('set role service_role');await db.query('select public.hr_process_notifications(500)');await db.query('select public.hr_process_notifications(500)');
      await owner(); assert.equal(await scalar("select count(*) from hr.outbox where processed_at is null"),0);
    });
    await suite.test("prior-day checkout remains attached and 24-hour records require correction", async () => {
      await owner();
      const newAuth=randomUUID();await db.query("insert into auth.users(id,email) values($1,'night@example.test')",[newAuth]);
      const night=(await db.query<{id:string}>("insert into hr.employees(organization_id,auth_id,email,name,employment_start_date) values($1,$2,'night@example.test','야간 테스트','2020-01-01') returning id",[org,newAuth])).rows[0].id;
      const prior=(await db.query<{id:string;work_date:string}>("insert into hr.attendance(organization_id,employee_id,work_date,check_in_at,policy_id) values($1,$2,hr.today()-1,hr.at_day(hr.today(),0)-interval '1 second',(hr.policy($1,hr.today()-1)).id) returning id,work_date::text",[org,night])).rows[0];
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[newAuth]);await db.exec('set role authenticated');
      await assert.rejects(command('attendance.in',{}),/이전 출근/);
      const status=(await query('today')).summary as Record<string,unknown>;assert.equal(status.base,'review_needed');
      const closed=await command('attendance.out',{id:prior.id,expected_version:1});assert.equal(closed.work_date,prior.work_date);
      const past=(await query('today',{date:prior.work_date})).summary as Record<string,unknown>;assert.equal(past.base,'checked_out');
      await owner();
      const ancient=(await db.query<{id:string}>("insert into hr.attendance(organization_id,employee_id,work_date,check_in_at,policy_id) values($1,$2,hr.today()-3,hr.at_day(hr.today()-3,540),(hr.policy($1,hr.today()-3)).id) returning id",[org,night])).rows[0];
      await db.exec('set role authenticated');
      await assert.rejects(command('attendance.out',{id:ancient.id,expected_version:1}),/24시간/);
      await assert.rejects(command('attendance.in',{}),/이전 출근/);
    });
    await suite.test("half-day schedules and cross-month usage use actual work dates", async () => {
      await owner();
      const first=String(await scalar("select (date_trunc('month',hr.today())+interval '2 months')::date::text"));
      const from=String(await scalar(`select ('${first}'::date-7)::text`));
      const to=String(await scalar(`select ('${first}'::date+7)::text`));
      await as(1);await command('leave.create',{start_date:from,end_date:to,unit:'full'});
      const previous=await query('leaves',{from,to:String(await scalar(`select ('${first}'::date-1)::text`))});
      const following=await query('leaves',{from:first,to});
      const combined=await query('leaves',{from,to});assert.equal(Number(previous.planned)+Number(following.planned),combined.planned);
      const date=String(await scalar(`select ('${to}'::date+8-extract(isodow from '${to}'::date)::integer)::text`));
      await command('leave.create',{start_date:date,end_date:date,unit:'am'});
      const summary=(await query('today',{date})).summary as Record<string,unknown>;
      assert.equal(summary.base,'expected');assert.equal(new Date(String(summary.expected_start)).getUTCHours(),5); // 14:00 Seoul, independent of database display timezone
    });
    await suite.test("scheduled reminders are once per workday and skip submitted reviews", async () => {
      await owner();
      const newAuth=randomUUID();await db.query("insert into auth.users values($1,'reminder@example.test')",[newAuth]);
      const employee=(await db.query<{id:string}>("insert into hr.employees(organization_id,auth_id,email,name,employment_start_date) values($1,$2,'reminder@example.test','알림 검증','2020-01-01') returning id",[org,newAuth])).rows[0].id;
      const endMinute=Number(await scalar("select least(1440,extract(hour from now() at time zone 'Asia/Seoul')::integer*60+extract(minute from now() at time zone 'Asia/Seoul')::integer+10)"));
      const policy=(await db.query<{id:string}>("insert into hr.policies(organization_id,effective_from,version,config) values($1,hr.today(),99,$2::jsonb) returning id",[org,JSON.stringify({weekdays:[1,2,3,4,5,6,7],start:0,end:endMinute,split:Math.floor(endMinute/2),breaks:[],holidays:[],grace:0})])).rows[0].id;
      await db.query("insert into hr.attendance(organization_id,employee_id,work_date,check_in_at,policy_id) values($1,$2,hr.today(),now(),$3)",[org,employee,policy]);
      await db.exec('set role service_role');await db.query('select public.hr_generate_reminders()');await db.query('select public.hr_generate_reminders()');
      await owner();const count=(await db.query<{n:number}>("select count(*)::integer n from hr.outbox where event_type='review.reminder' and $1=any(recipients)",[employee])).rows[0].n;assert.equal(count,1);
      await db.query("insert into hr.reviews(organization_id,employee_id,work_date,latest_revision,submitted_at) values($1,$2,hr.today(),1,now())",[org,employee]);
      await db.query("delete from hr.outbox where event_type='review.reminder' and $1=any(recipients)",[employee]);
      await db.exec('set role service_role');await db.query('select public.hr_generate_reminders()');
      await owner();assert.equal((await db.query<{n:number}>("select count(*)::integer n from hr.outbox where event_type='review.reminder' and $1=any(recipients)",[employee])).rows[0].n,0);
    });
  } finally { await db.close(); }
});
