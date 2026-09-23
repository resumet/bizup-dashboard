import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";

test("channels accumulate in first-seen order and reanalysis updates only the matching channel",async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key); create table public.workspaces(id uuid primary key);
      create table public.workspace_members(workspace_id uuid,user_id uuid);
      create function auth.uid() returns uuid language sql stable as $$ select current_setting('test.user')::uuid $$;
      grant usage on schema public,auth to authenticated; grant select on workspace_members to authenticated;`);
    await db.exec(await readFile("supabase/migrations/202609230007_youtube_channel_analyzer.sql","utf8"));

    const user="00000000-0000-0000-0000-000000000001";
    const workspace="00000000-0000-0000-0000-000000000002";
    const firstBatch="00000000-0000-0000-0000-000000000003";
    const secondBatch="00000000-0000-0000-0000-000000000004";
    const thirdBatch="00000000-0000-0000-0000-000000000005";
    await db.query("insert into auth.users values($1)",[user]);
    await db.query("insert into workspaces values($1)",[workspace]);
    await db.query("insert into workspace_members values($1,$2)",[workspace,user]);
    await db.query("insert into youtube_analysis_batches(id,workspace_id,created_by,input_count) values($1,$2,$3,1)",[firstBatch,workspace,user]);

    // Seed a legacy snapshot before applying the cumulative migration. It must
    // survive as the initial current state.
    await db.query(
      "select public.save_youtube_analysis($1,$2,$3,$4,$5,$6)",
      [firstBatch,JSON.stringify({id:"channel-a",name:"Original"}),JSON.stringify({count:1}),"[]","2026-01-01",JSON.stringify([{id:"old-video",publishedAt:"2026-01-01",views:10}])],
    );
    await db.exec(await readFile("supabase/migrations/202609230008_youtube_channel_accumulation.sql","utf8"));

    const initial=await db.query<{first_analyzed_at:string}>("select first_analyzed_at from youtube_analyzed_channels where channel_id='channel-a'");
    assert.equal(initial.rows.length,1);
    assert.equal((await db.query("select * from youtube_channel_videos")).rows.length,1);

    await db.query("insert into youtube_analysis_batches(id,workspace_id,created_by,input_count) values($1,$2,$3,1),($4,$2,$3,1)",[secondBatch,workspace,user,thirdBatch]);
    await db.query("insert into youtube_analysis_requests(batch_id,input_order,input_url,resolved_channel_id) values($1,0,'a','channel-a'),($2,0,'b','channel-b')",[secondBatch,thirdBatch]);
    const save="select public.save_youtube_channel($1,$2,$3,$4,$5,$6) as channel_id";

    await db.query(save,[
      secondBatch,
      JSON.stringify({id:"channel-a",name:"Updated"}),
      JSON.stringify({count:2}),
      "[]",
      "2099-02-01",
      JSON.stringify([{id:"new-video",publishedAt:"2099-02-01",views:20}]),
    ]);
    await db.query(save,[
      thirdBatch,
      JSON.stringify({id:"channel-b",name:"New channel"}),
      JSON.stringify({count:1}),
      "[]",
      "2100-03-01",
      JSON.stringify([{id:"second-video",publishedAt:"2100-03-01",views:30}]),
    ]);

    const channels=await db.query<{position:number;channel_id:string;channel:{name:string};metrics:{count:number};first_analyzed_at:string}>("select position,channel_id,channel,metrics,first_analyzed_at from youtube_analyzed_channels order by position");
    assert.deepEqual(channels.rows.map(row=>row.channel_id),["channel-a","channel-b"]);
    assert.equal(channels.rows[0].channel.name,"Updated");
    assert.equal(channels.rows[0].metrics.count,2);
    assert.equal(String(channels.rows[0].first_analyzed_at),String(initial.rows[0].first_analyzed_at));
    assert.ok(channels.rows[0].position < channels.rows[1].position);
    assert.deepEqual((await db.query<{video_id:string}>("select video_id from youtube_channel_videos where channel_id='channel-a'")).rows.map(row=>row.video_id),["new-video"]);
    assert.equal((await db.query<{status:string}>("select status from youtube_analysis_requests where batch_id=$1",[secondBatch])).rows[0].status,"completed");

    // An older overlapping job cannot overwrite a newer channel state.
    await db.query(save,[secondBatch,JSON.stringify({id:"channel-a",name:"Stale"}),JSON.stringify({count:0}),"[]","2098-01-15","[]"]);
    assert.equal((await db.query<{channel:{name:string} }>("select channel from youtube_analyzed_channels where channel_id='channel-a'")).rows[0].channel.name,"Updated");

    // Deleting one current channel cascades only its videos. Analyzing it again
    // creates a new entry at the bottom of the cumulative list.
    const removedPosition=channels.rows[1].position;
    await db.query("delete from youtube_analyzed_channels where workspace_id=$1 and channel_id='channel-b'",[workspace]);
    assert.equal((await db.query("select * from youtube_channel_videos where channel_id='channel-b'")).rows.length,0);
    assert.equal((await db.query("select * from youtube_analyzed_channels where channel_id='channel-a'")).rows.length,1);
    await db.query(save,[thirdBatch,JSON.stringify({id:"channel-b",name:"Re-added"}),JSON.stringify({count:1}),"[]","2101-03-01",JSON.stringify([{id:"readded-video",publishedAt:"2101-03-01",views:40}])]);
    assert.ok((await db.query<{position:number}>("select position from youtube_analyzed_channels where channel_id='channel-b'")).rows[0].position>removedPosition);

    // Channel and video replacement are one transaction.
    await assert.rejects(db.query(save,[thirdBatch,'{"id":"broken"}',"{}","[]","2102-04-01",'[{"id":"x","publishedAt":"invalid"}]']));
    assert.equal((await db.query("select * from youtube_analyzed_channels where channel_id='broken'")).rows.length,0);

    await db.exec(`set role authenticated; select set_config('test.user','${user}',false)`);
    assert.equal((await db.query("select * from youtube_analyzed_channels")).rows.length,2);
    assert.equal((await db.query("select * from youtube_channel_videos")).rows.length,2);
    await db.exec("select set_config('test.user','00000000-0000-0000-0000-000000000099',false)");
    assert.equal((await db.query("select * from youtube_analyzed_channels")).rows.length,0);
    assert.equal((await db.query("select * from youtube_channel_videos")).rows.length,0);
    await assert.rejects(db.query(save,[secondBatch,"{}","{}","[]","2026-05-01","[]"]),/permission denied/);
  } finally {await db.close();}
});
