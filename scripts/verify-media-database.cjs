/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const {build}=require('esbuild');
const {mediaFixture}=require('./media-fixture.cjs');
(async()=>{const {db,admin,C,C2,W}=await mediaFixture();try{
 const settings=(await db.query('select * from course_youtube_settings order by course_id')).rows;
 assert.equal(settings.length,2);assert.equal(settings[0].public_enabled,false);assert.equal(settings[0].brief_enabled,false);assert.notEqual(settings[0].public_token,settings[0].brief_token);
 assert.equal((await db.query('select * from course_document_settings')).rows.length,2);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(db.query('select * from course_youtube_settings'),/permission denied/);await assert.rejects(db.query('select * from workspace_notion_media_connections'),/permission denied/);await assert.rejects(db.query("select update_public_youtube_media('x','brief','{}')"),/permission denied/);await db.exec('reset role');}
 const token=settings[0].public_token,briefToken=settings[0].brief_token;
 const row=(await db.query("insert into course_youtube_appearances(course_id,channel_name,channel_url,note) values($1,'채널','https://example.test','원본') returning *",[C])).rows[0];
 const foreign=(await db.query("insert into course_youtube_appearances(course_id,channel_name,channel_url) values($1,'별도','https://example.test') returning *",[C2])).rows[0];
 const payload={id:row.id,revision:0,request_status:'confirmed',filming_at:'2026-11-01T10:00:00+09:00',filming_confirmed:true,note:'확정',respondent:'담당자'};
 let response=await admin.rpc('update_public_youtube_media',{p_token:token,p_kind:'schedule',p_payload:payload});assert.match(response.error.message,/NOT_FOUND/);
 await db.query('update course_youtube_settings set public_enabled=true,brief_enabled=true where course_id=$1',[C]);
 response=await admin.rpc('update_public_youtube_media',{p_token:token,p_kind:'schedule',p_payload:{...payload,id:foreign.id}});assert.match(response.error.message,/CONFLICT/);
 response=await admin.rpc('update_public_youtube_media',{p_token:token,p_kind:'schedule',p_payload:payload});assert.equal(response.data.revision,1);
 response=await admin.rpc('update_public_youtube_media',{p_token:token,p_kind:'schedule',p_payload:payload});assert.match(response.error.message,/CONFLICT/);
 response=await admin.rpc('update_public_youtube_media',{p_token:briefToken,p_kind:'brief',p_payload:{revision:0,brief:{basicInfo:'강사'}}});assert.equal(response.data.revision,1);
 await db.query('update course_youtube_settings set brief_enabled=false,public_token=repeat(\'a\',48) where course_id=$1',[C]);
 response=await admin.rpc('update_public_youtube_media',{p_token:token,p_kind:'schedule',p_payload:{...payload,revision:1}});assert.match(response.error.message,/NOT_FOUND/);
 response=await admin.rpc('update_public_youtube_media',{p_token:briefToken,p_kind:'brief',p_payload:{revision:1,brief:{basicInfo:'변경'}}});assert.match(response.error.message,/NOT_FOUND/);
 // Course detail saves must preserve independently managed appearances and their stable IDs.
 const bundle=await build({entryPoints:['src/lib/course-operations/server.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fixture',setup(p){p.onResolve({filter:/^(server-only|@\/lib\/supabase\/admin|@\/lib\/supabase\/auth)$/},args=>({path:args.path,namespace:'mock'}));p.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='server-only'?'':args.path.endsWith('/admin')?'exports.createAdminClient=()=>fixture.admin;':'exports.getAuthenticatedUser=async()=>null;',loader:'js'}));}}]});
 const loaded={exports:{}};new Function('require','module','exports','fixture',bundle.outputFiles[0].text)(require,loaded,loaded.exports,{admin});
 await loaded.exports.replaceCourseChildren(C,{options:[],youtubeAppearances:[],liveVideos:[{name:'라이브',videoUrl:'https://example.test/live',note:''}]},{replaceOptions:false,replaceVideos:true,replaceAppearances:false});
 assert.equal((await db.query('select revision from course_youtube_appearances where id=$1',[row.id])).rows[0].revision,1);
 assert.equal((await db.query('select * from course_live_videos where course_id=$1',[C])).rows.length,1);
 // Auto-generated settings must not make an otherwise empty course undeletable.
 const empty='00000000-0000-4000-8000-000000000099';await db.query("insert into courses(id,workspace_id,name) values($1,$2,'삭제검증')",[empty,W]);await db.query('delete from courses where id=$1',[empty]);assert.equal((await db.query('select * from course_youtube_settings where course_id=$1',[empty])).rows.length,0);
 // Video updates share the same revision check and notification transaction. Missing video fields preserve old values.
 const events=async()=>Number((await db.query('select count(*)::int n from media_notifications')).rows[0].n);
 const beforeVideo=await events();const videoArgs={p_token:'a'.repeat(48),p_kind:'schedule'};
 response=await admin.rpc('update_public_youtube_media',{...videoArgs,p_payload:{...payload,revision:1,video_url:'https://example.test/published'}});assert.equal(response.error,null);assert.equal(response.data.video_url,'https://example.test/published');assert.equal(await events(),beforeVideo+1);
 assert.ok((await db.query('select message from media_notifications order by id desc limit 1')).rows[0].message.includes('게시된 영상: https://example.test/published'));
 response=await admin.rpc('update_public_youtube_media',{...videoArgs,p_payload:{...payload,revision:2}});assert.equal(response.data.video_url,'https://example.test/published');assert.equal(await events(),beforeVideo+1);
 response=await admin.rpc('update_public_youtube_media',{...videoArgs,p_payload:{...payload,revision:3,request_status:'planned'}});assert.match(response.error.message,/INVALID_STATUS/);assert.equal(await events(),beforeVideo+1);
 response=await admin.rpc('update_public_youtube_media',{...videoArgs,p_payload:{...payload,revision:3,video_url:''}});assert.equal(response.data.video_url,'');assert.equal(await events(),beforeVideo+2);
 console.log('PASS: migration/backfill/course provisioning; protected tokens; disabled/regenerated links; course isolation, concurrency; old video preservation; empty course deletion.');
}finally{await db.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
