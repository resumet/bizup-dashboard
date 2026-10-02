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
    await db.exec(await readFile("supabase/migrations_archive/20260929/202609230007_youtube_channel_analyzer.sql","utf8"));

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
    await db.exec(await readFile("supabase/migrations_archive/20260929/202609230008_youtube_channel_accumulation.sql","utf8"));
    const emailMigration=await readFile("supabase/migrations_archive/20260929/202609270005_youtube_channel_email.sql","utf8");
    await db.exec(emailMigration);
    await db.exec(emailMigration);
    const attributesMigration=await readFile("supabase/migrations_archive/20260929/202609270006_youtube_channel_attributes.sql","utf8");
    await db.exec(attributesMigration);
    await db.exec(attributesMigration);
    const memoMigration=await readFile("supabase/migrations_archive/20260929/202609280001_youtube_channel_memo.sql","utf8");
    await db.exec(memoMigration);
    await db.exec(memoMigration);
    const exclusionMigration=await readFile("supabase/migrations_archive/20260929/202609280002_youtube_exclude_updates.sql","utf8");
    await db.exec(exclusionMigration);
    await db.exec(exclusionMigration);
    const emailDraftMigration=await readFile("supabase/migrations/20261001053235_youtube_channel_email_drafts.sql","utf8");
    await db.exec(emailDraftMigration);
    await db.exec(emailDraftMigration);
    const emailSubjectMigration=await readFile("supabase/migrations/202610020002_youtube_email_subject.sql","utf8");
    await db.exec(emailSubjectMigration);
    await db.exec(emailSubjectMigration);
    const appearanceEmailStatusMigration=await readFile("supabase/migrations/20261002082201_youtube_appearance_request_email_status.sql","utf8");
    await db.exec(appearanceEmailStatusMigration);
    await db.exec(appearanceEmailStatusMigration);

    const initial=await db.query<{first_analyzed_at:string}>("select first_analyzed_at from youtube_analyzed_channels where channel_id='channel-a'");
    assert.equal(initial.rows.length,1);
    assert.equal((await db.query("select * from youtube_channel_videos")).rows.length,1);
    await db.query("update youtube_analyzed_channels set email=$1, category=$2, appearance_fee=$3, rs_percent=$4, memo=$5, excluded_from_updates=true, appearance_request_email_sent=true where channel_id='channel-a'",["contact@example.com","타이탄 외부채널",1000000,25.125,"영업 미팅 예정\n자료 전달 필요"]);
    await db.query("insert into youtube_channel_email_settings(workspace_id,email_subject,email_body,signature_mode,custom_signature) values($1,$2,$3,'custom',$4)",[workspace,"유튜브 출연 제안드립니다","안녕하세요.\n유튜브 출연을 제안드립니다.","비즈업 홍길동\n010-0000-0000"]);
    await assert.rejects(db.query("update youtube_analyzed_channels set category='unknown' where channel_id='channel-a'"),/youtube_analyzed_channels_category_valid/);
    await assert.rejects(db.query("update youtube_analyzed_channels set appearance_fee=-1 where channel_id='channel-a'"),/youtube_analyzed_channels_appearance_fee_nonnegative/);
    await assert.rejects(db.query("update youtube_analyzed_channels set rs_percent=101 where channel_id='channel-a'"),/youtube_analyzed_channels_rs_percent_range/);
    await assert.rejects(db.query("update youtube_analyzed_channels set memo=$1 where channel_id='channel-a'",["a".repeat(2001)]),/youtube_analyzed_channels_memo_length/);
    await assert.rejects(db.query("update youtube_channel_email_settings set email_body=$1 where workspace_id=$2",["a".repeat(5001),workspace]),/youtube_channel_email_settings_body_length/);
    await assert.rejects(db.query("update youtube_channel_email_settings set email_subject=$1 where workspace_id=$2",["a".repeat(501),workspace]),/youtube_channel_email_settings_subject_length/);
    await assert.rejects(db.query("update youtube_channel_email_settings set signature_mode='unknown' where workspace_id=$1",[workspace]),/youtube_channel_email_settings_signature_mode_valid/);
    await assert.rejects(db.query("update youtube_channel_email_settings set custom_signature=null where workspace_id=$1",[workspace]),/youtube_channel_email_settings_custom_signature_required/);

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

    const channels=await db.query<{position:number;channel_id:string;channel:{name:string};email:string|null;appearance_request_email_sent:boolean;category:string|null;appearance_fee:number|null;rs_percent:number|null;memo:string|null;excluded_from_updates:boolean;metrics:{count:number};first_analyzed_at:string}>("select position,channel_id,channel,email,appearance_request_email_sent,category,appearance_fee,rs_percent,memo,excluded_from_updates,metrics,first_analyzed_at from youtube_analyzed_channels order by position");
    assert.deepEqual(channels.rows.map(row=>row.channel_id),["channel-a","channel-b"]);
    assert.equal(channels.rows[0].channel.name,"Updated");
    assert.equal(channels.rows[0].metrics.count,2);
    assert.equal(channels.rows[0].email,"contact@example.com");
    assert.equal(channels.rows[1].email,null);
    assert.equal(channels.rows[0].appearance_request_email_sent,true);
    assert.equal(channels.rows[1].appearance_request_email_sent,false);
    assert.equal(channels.rows[0].category,"타이탄 외부채널");
    assert.equal(Number(channels.rows[0].appearance_fee),1000000);
    assert.equal(Number(channels.rows[0].rs_percent),25.125);
    assert.equal(channels.rows[0].memo,"영업 미팅 예정\n자료 전달 필요");
    assert.equal(channels.rows[0].excluded_from_updates,true);
    assert.equal(channels.rows[1].category,null);
    assert.equal(channels.rows[1].appearance_fee,null);
    assert.equal(channels.rows[1].rs_percent,null);
    assert.equal(channels.rows[1].memo,null);
    assert.equal(channels.rows[1].excluded_from_updates,false);
    assert.equal(String(channels.rows[0].first_analyzed_at),String(initial.rows[0].first_analyzed_at));
    assert.ok(channels.rows[0].position < channels.rows[1].position);
    assert.deepEqual((await db.query<{video_id:string}>("select video_id from youtube_channel_videos where channel_id='channel-a'")).rows.map(row=>row.video_id),["new-video"]);
    assert.equal((await db.query<{status:string}>("select status from youtube_analysis_requests where batch_id=$1",[secondBatch])).rows[0].status,"completed");

    // An older overlapping job cannot overwrite a newer channel state.
    await db.query(save,[secondBatch,JSON.stringify({id:"channel-a",name:"Stale"}),JSON.stringify({count:0}),"[]","2098-01-15","[]"]);
    assert.equal((await db.query<{channel:{name:string} }>("select channel from youtube_analyzed_channels where channel_id='channel-a'")).rows[0].channel.name,"Updated");
    assert.equal((await db.query<{email:string}>("select email from youtube_analyzed_channels where channel_id='channel-a'")).rows[0].email,"contact@example.com");
    const retained=(await db.query<{category:string;appearance_fee:number;rs_percent:string;memo:string;excluded_from_updates:boolean;appearance_request_email_sent:boolean}>("select category,appearance_fee,rs_percent,memo,excluded_from_updates,appearance_request_email_sent from youtube_analyzed_channels where channel_id='channel-a'")).rows[0];
    assert.equal(retained.category,"타이탄 외부채널");
    assert.equal(Number(retained.appearance_fee),1000000);
    assert.equal(Number(retained.rs_percent),25.125);
    assert.equal(retained.memo,"영업 미팅 예정\n자료 전달 필요");
    assert.equal(retained.excluded_from_updates,true);
    assert.equal(retained.appearance_request_email_sent,true);
    const emailSettings=(await db.query<{email_subject:string;email_body:string;signature_mode:string;custom_signature:string}>("select email_subject,email_body,signature_mode,custom_signature from youtube_channel_email_settings where workspace_id=$1",[workspace])).rows[0];
    assert.equal(emailSettings.email_subject,"유튜브 출연 제안드립니다");
    assert.equal(emailSettings.email_body,"안녕하세요.\n유튜브 출연을 제안드립니다.");
    assert.equal(emailSettings.signature_mode,"custom");
    assert.equal(emailSettings.custom_signature,"비즈업 홍길동\n010-0000-0000");

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
    assert.equal((await db.query("select * from youtube_channel_email_settings")).rows.length,1);
    await assert.rejects(db.query("update youtube_analyzed_channels set email='other@example.com' where channel_id='channel-a'"),/permission denied/);
    await assert.rejects(db.query("update youtube_channel_email_settings set email_body='other'"),/permission denied/);
    await db.exec("select set_config('test.user','00000000-0000-0000-0000-000000000099',false)");
    assert.equal((await db.query("select * from youtube_analyzed_channels")).rows.length,0);
    assert.equal((await db.query("select * from youtube_channel_videos")).rows.length,0);
    assert.equal((await db.query("select * from youtube_channel_email_settings")).rows.length,0);
    await assert.rejects(db.query(save,[secondBatch,"{}","{}","[]","2026-05-01","[]"]),/permission denied/);
  } finally {await db.close();}
});
