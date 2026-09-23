import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

test("snapshots are atomic, idempotent, immutable and workspace scoped",async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key); create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid,user_id uuid);
      create function auth.uid() returns uuid language sql stable as $$ select current_setting('test.user')::uuid $$;
      grant usage on schema public,auth to authenticated; grant select on workspace_members to authenticated;`);
    await db.exec(await readFile("supabase/migrations/202609230007_youtube_channel_analyzer.sql","utf8"));
    const user="00000000-0000-0000-0000-000000000001",ws="00000000-0000-0000-0000-000000000002",batch="00000000-0000-0000-0000-000000000003";
    await db.query("insert into auth.users values($1)",[user]);
    await db.query("insert into workspaces values($1)",[ws]);
    await db.query("insert into workspace_members values($1,$2)",[ws,user]);
    await db.query("insert into youtube_analysis_batches(id,workspace_id,created_by,input_count) values($1,$2,$3,1)",[batch,ws,user]);
    const args=[batch,JSON.stringify({id:"channel"}),"{}","[]","2026-01-01",JSON.stringify([{id:"video",publishedAt:"2026-01-01",views:10}])];
    const save="select public.save_youtube_analysis($1,$2,$3,$4,$5,$6) as id";
    const first=await db.query<{id:string}>(save,args);
    const second=await db.query<{id:string}>(save,args);
    assert.equal(first.rows[0].id,second.rows[0].id);
    assert.equal((await db.query("select * from youtube_video_snapshots")).rows.length,1);
    await assert.rejects(db.exec("update youtube_analysis_runs set metrics='{}'"),/immutable/);
    await assert.rejects(db.exec("delete from youtube_video_snapshots"),/immutable/);
    await assert.rejects(db.query(save,[batch,'{"id":"bad"}',"{}","[]","2026-01-01",'[{"id":"x","publishedAt":"invalid"}]']));
    assert.equal((await db.query("select * from youtube_analysis_runs")).rows.length,1);
    await db.exec(`set role authenticated; select set_config('test.user','${user}',false)`);
    assert.equal((await db.query("select * from youtube_latest_analyses")).rows.length,1);
    await db.exec("select set_config('test.user','00000000-0000-0000-0000-000000000099',false)");
    for(const table of ["youtube_analysis_batches","youtube_analysis_runs","youtube_video_snapshots","youtube_latest_analyses"]) assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
    await assert.rejects(db.query(save,args),/permission denied/);
  } finally {await db.close();}
});
