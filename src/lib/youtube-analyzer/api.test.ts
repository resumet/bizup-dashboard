import { test } from "node:test";
import assert from "node:assert/strict";
import { videoPage, youtube } from "./api";
import type { Channel } from "./model";

test("API fetch is fresh and quota failures are not retried or leaked",async()=>{
  const previous=process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY="test-secret";
  try {
    let calls=0;
    const mock:typeof fetch=async(url,init)=>{
      calls++;assert.equal(new URL(String(url)).hostname,"www.googleapis.com");assert.equal(init?.cache,"no-store");
      return Response.json({items:[]});
    };
    await youtube("channels",{id:"test"},mock);
    await youtube("channels",{id:"test"},mock);
    assert.equal(calls,2);
    calls=0;
    await assert.rejects(youtube("channels",{},async()=>{calls++;return Response.json({error:{errors:[{reason:"quotaExceeded"}]}},{status:403});}),/YOUTUBE_QUOTA_EXCEEDED/);
    assert.equal(calls,1);
    calls=0;
    await youtube("videos",{id:"test"},async()=>{
      calls++;
      return calls===1 ? Response.json({error:{}},{status:503}) : Response.json({items:[]});
    });
    assert.equal(calls,2);
    calls=0;
    await assert.rejects(youtube("videos",{},async()=>{calls++;return Response.json({error:{}},{status:404});}),/NOT_FOUND/);
    assert.equal(calls,1);
  } finally {if(previous===undefined) delete process.env.YOUTUBE_API_KEY;else process.env.YOUTUBE_API_KEY=previous;}
});

test("video collection excludes vertical and square Shorts but retains short landscape videos",async()=>{
  const previous=process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY="test-secret";
  const channel:Channel={id:"channel-a",name:"Channel",url:"https://youtube.com/@channel",thumbnail:null,reported:8,subscribers:null,playlist:"uploads"};
  const rows=[
    {id:"portrait",duration:"PT2M",width:405,height:720},
    {id:"square",duration:"PT3M",width:720,height:720},
    {id:"landscape",duration:"PT1M",width:720,height:405},
    {id:"boundary-portrait",duration:"PT3M1S",width:405,height:720},
    {id:"long-portrait",duration:"PT3M2S",width:405,height:720},
    {id:"unknown-ratio",duration:"PT1M",width:undefined,height:undefined},
    {id:"old-short",duration:"PT59S",width:405,height:720,publishedAt:"2023-01-01T00:00:00Z"},
    {id:"old-regular",duration:"PT2M",width:405,height:720,publishedAt:"2023-01-01T00:00:00Z"},
  ];
  const mock:typeof fetch=async(input)=>{
    const url=new URL(String(input));
    if(url.pathname.endsWith("playlistItems")) return Response.json({items:rows.map(row=>({contentDetails:{videoId:row.id}})),nextPageToken:"next"});
    assert.equal(url.searchParams.get("part"),"snippet,statistics,status,contentDetails,player");
    assert.equal(url.searchParams.get("maxWidth"),"720");
    assert.equal(url.searchParams.get("maxHeight"),"720");
    return Response.json({items:rows.map(row=>({id:row.id,snippet:{title:row.id,channelId:channel.id,publishedAt:"publishedAt" in row ? row.publishedAt : "2026-01-01T00:00:00Z"},contentDetails:{duration:row.duration},player:{embedWidth:row.width,embedHeight:row.height},statistics:{viewCount:"10"},status:{privacyStatus:"public"}}))});
  };
  try {
    const result=await videoPage(channel,undefined,mock);
    assert.equal(result.next,"next");
    assert.deepEqual(result.videos.map(video=>video.id),["landscape","long-portrait","old-regular"]);
  } finally {if(previous===undefined) delete process.env.YOUTUBE_API_KEY;else process.env.YOUTUBE_API_KEY=previous;}
});
