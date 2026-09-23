import {test} from "node:test";
import assert from "node:assert/strict";
import {youtubeAnalysisWorkflow} from "../../workflows/youtube-analysis";

test("workflow paginates all uploads, deduplicates channels per batch, and recollects on reanalysis",async()=>{
  const original=globalThis.fetch;
  const env={...process.env};
  process.env.YOUTUBE_API_KEY="test";
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY="test";
  const channelId=`UC${"a".repeat(22)}`;
  const saved:Record<string,unknown>[]=[];
  const requests=new Map<string,{status:string;resolved_channel_id?:string;error_code?:string}>();
  const pages:string[]=[];
  const states:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));
    if(url.hostname==="www.googleapis.com") {
      if(url.pathname.endsWith("channels")) return Response.json({items:[{id:channelId,snippet:{title:"Channel"},statistics:{videoCount:"120",hiddenSubscriberCount:true},contentDetails:{relatedPlaylists:{uploads:"uploads"}}}]});
      if(url.pathname.endsWith("playlistItems")) {
        const page=Number(url.searchParams.get("pageToken") ?? 0);
        pages.push(String(page));
        return Response.json({items:Array.from({length:page===2 ? 20 : 50},(_,i)=>({contentDetails:{videoId:`v${page*50+i}`}})),...(page<2 ? {nextPageToken:String(page+1)} : {})});
      }
      const ids=url.searchParams.get("id")!.split(",");
      assert.ok(ids.length<=50);
      return Response.json({items:ids.map(id=>({id,snippet:{title:id,channelId,publishedAt:"2026-01-01T00:00:00Z"},statistics:{viewCount:"100"},status:{privacyStatus:"public"}}))});
    }
    assert.equal(url.hostname,"supabase.test");
    const body=init?.body ? JSON.parse(String(init.body)) : null;
    if(url.pathname.endsWith("save_youtube_analysis")) {
      saved.push(body);
      for(const row of requests.values()) if(row.resolved_channel_id===channelId) row.status="completed";
      return Response.json("run-id");
    }
    if(url.pathname.endsWith("youtube_analysis_requests")) {
      if(init?.method==="PATCH") {
        const ids=url.searchParams.get("id")!.slice(4,-1).split(",").map(id=>id.replaceAll('"',''));
        for(const id of ids) requests.set(id,{...requests.get(id),...body});
        return new Response(null,{status:204});
      }
      return Response.json([...requests.values()]);
    }
    if(body?.status) states.push(body.status);
    return new Response(null,{status:204});
  };
  try {
    const input=[{id:"1",input_url:"https://youtube.com/@test"},{id:"2",input_url:`https://youtube.com/channel/${channelId}`},{id:"3",input_url:"invalid"}];
    await youtubeAnalysisWorkflow("batch-a",input,3);
    assert.equal(saved.length,1);
    assert.equal((saved[0].p_videos as unknown[]).length,120);
    assert.equal((saved[0].p_metrics as {recent20:number}).recent20,100);
    assert.equal(requests.get("3")?.error_code,"INVALID_URL",JSON.stringify([...requests]));
    assert.equal(states.at(-1),"partial");
    await youtubeAnalysisWorkflow("batch-b",input,3);
    assert.equal(saved.length,2);
    assert.deepEqual(pages,["0","1","2","0","1","2"]);
    assert.equal(saved[1].p_batch,"batch-b");
  } finally {
    globalThis.fetch=original;
    for(const name of ["YOUTUBE_API_KEY","NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"]) { if(env[name]===undefined) delete process.env[name];else process.env[name]=env[name]; }
  }
});
