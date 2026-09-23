import { test } from "node:test";
import assert from "node:assert/strict";
import { youtube } from "./api";

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
