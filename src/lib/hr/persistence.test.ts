import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("HR records survive database shutdown and another authenticated session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bizup-hr-persistence-"));
  const authId = randomUUID(); let taskId: string;
  try {
    let db = new PGlite(directory);
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    for (const file of (await readdir("supabase/migrations")).filter(name => /^20260914\d+_hr_/.test(name)).sort()) await db.exec(await readFile(`supabase/migrations/${file}`,"utf8"));
    await db.query("insert into auth.users values($1,'persist@example.test')",[authId]);
    await db.query("select public.hr_bootstrap($1,'영속성 테스트','2020-01-01')",[authId]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[authId]);await db.exec('set role authenticated');
    const command = async (action:string,body:Record<string,unknown>) => (await db.query<{data:Record<string,unknown>}>("select public.hr_command($1,$2::jsonb,$3::uuid) data",[action,JSON.stringify(body),randomUUID()])).rows[0].data;
    const task=await command('task.create',{title:'재시작 후에도 남는 업무'});taskId=String(task.id);
    const attendance=await command('attendance.in',{});await command('attendance.out',{id:attendance.id,expected_version:attendance.version});
    const future=(await db.query<{date:string}>("select (current_date+30)::text date")).rows[0].date;
    const end=(await db.query<{date:string}>("select (current_date+37)::text date")).rows[0].date;
    await command('leave.create',{start_date:future,end_date:end,unit:'full'});
    await db.close();
    db=new PGlite(directory);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[authId]);await db.exec('set role authenticated');
      const task=(await db.query<{data:{task:{title:string}}}>("select public.hr_query('task',$1::jsonb) data",[JSON.stringify({id:taskId})])).rows[0].data;
      assert.equal(task.task.title,'재시작 후에도 남는 업무');
      const today=(await db.query<{data:{summary:{attendance:{check_out_at:string}}}}>("select public.hr_query('today') data")).rows[0].data;
      assert.ok(today.summary.attendance.check_out_at);
      const leaves=(await db.query<{data:{total:number}}>("select public.hr_query('leaves',$1::jsonb) data",[JSON.stringify({from:future,to:end})])).rows[0].data;
      assert.equal(leaves.total,1);
    } finally { await db.close(); }
  } finally {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep + "bizup-hr-persistence-"), "Cleanup stays inside the generated test directory");
    await rm(target,{recursive:true,force:true});
  }
});
