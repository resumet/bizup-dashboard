import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    for (const file of (await readdir("supabase/migrations")).filter(name => /^20260914\d+_hr_/.test(name)).sort()) await db.exec(await readFile(`supabase/migrations/${file}`,"utf8"));
    await db.exec("insert into auth.users select gen_random_uuid(),'load-'||n||'@example.test' from generate_series(1,100) n;");
    const accounts = (await db.query<{id:string;email:string}>("select * from auth.users order by email")).rows;
    const organization = (await db.query<{id:string}>("select public.hr_bootstrap($1,'부하검증 관리자','2020-01-01') id",[accounts[0].id])).rows[0].id;
    await db.query("insert into hr.employees(organization_id,auth_id,email,name,employment_start_date) select $1,id,email,'가상 직원 '||row_number() over(order by email),'2020-01-01' from auth.users where id<>$2",[organization,accounts[0].id]);
    await db.query(`with staff as (select id,row_number() over(order by email) n from hr.employees), chief as (select id from hr.employees where role='admin')
      insert into hr.tasks(organization_id,title,description,creator_id,assignee_id,planned_date,status)
      select $1,'부하검증 업무 '||generated.n,'실제 개인정보를 포함하지 않는 가상 업무',chief.id,(select id from staff where staff.n=(generated.n%100)+1),hr.today()-generated.n%30,
        case generated.n%4 when 0 then 'ready' when 1 then 'doing' when 2 then 'done' else 'cancelled' end
      from generate_series(1,10000) generated(n) cross join chief`,[organization]);
    const measurements: Record<string, {count:number;p95_ms:number;max_ms:number}> = {};
    async function timed(name: string, work: (index: number) => Promise<unknown>, batches = 3) {
      const samples:number[]=[];
      for (let batch=0;batch<batches;batch++) await Promise.all(Array.from({length:20},async (_,i)=>{const start=performance.now();await work(i+batch*20);samples.push(performance.now()-start);}));
      samples.sort((a,b)=>a-b);measurements[name]={count:samples.length,p95_ms:Math.round(samples[Math.ceil(samples.length*0.95)-1]),max_ms:Math.round(samples.at(-1)!)};
      console.log(name,measurements[name]);
    }
    async function queryFor(index:number,resource:string,filter:Record<string,unknown>={}) {
      return db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[accounts[index%100].id]);await tx.exec('set local role authenticated');return tx.query('select public.hr_query($1,$2::jsonb)',[resource,JSON.stringify(filter)]);});
    }
    await timed('employee_task_list',i=>queryFor(i,'tasks',{scope:'assigned',status:'all'}));
    await timed('admin_dashboard',()=>queryFor(0,'admin',{limit:100}),1);
    const tasks=(await db.query<{id:string;version:number}>("select id,version from hr.tasks order by id limit 60")).rows;
    await timed('task_update',i=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[accounts[0].id]);await tx.exec('set local role authenticated');return tx.query('select public.hr_command($1,$2::jsonb,$3::uuid)',['task.update',JSON.stringify({id:tasks[i].id,expected_version:1,title:`변경 검증 ${i}`}),randomUUID()]);}));
    await timed('check_in',i=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[accounts[i].id]);await tx.exec('set local role authenticated');return tx.query("select public.hr_command('attendance.in','{}',$1::uuid)",[randomUUID()]);}));
    const report = { engine:"PostgreSQL via PGlite (single connection)", employees:100,tasks:10000,concurrent_requests:20,measurements,measured_at:new Date().toISOString() };
    await mkdir('tmp/hr-browser',{recursive:true});await writeFile('tmp/hr-browser/performance.json',JSON.stringify(report,null,2));
    for(const [name,value] of Object.entries(measurements)) assert.ok(value.p95_ms<=2000,`${name} p95 ${value.p95_ms}ms exceeds 2000ms`);
  } finally { await db.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
