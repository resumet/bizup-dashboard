/* eslint-disable @typescript-eslint/no-require-imports -- Browser verification harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async()=>{
  let browser,server;
  try {
    const bundle=await esbuild.build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {YoutubeChannels} from './src/components/youtube-analyzer/youtube-channels';createRoot(document.getElementById('root')).render(<YoutubeChannels/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env':'{}'}});
    const css=await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});
    const batch={id:'batch-1',status:'partial',input_count:2,unique_channel_count:1,created_at:'2026-09-23T10:00:00Z',completed_at:'2026-09-23T10:01:00Z'};
    const video={id:'abcdefghijk',title:'공개 영상 분석 테스트',publishedAt:'2026-09-01',views:123456,likes:null,comments:0};
    const run={id:'run-1',batch_id:batch.id,channel_id:'channel',channel:{name:'배워야산다 채널',url:'https://www.youtube.com/@%ED%95%9C%EA%B8%80',thumbnail:null,reported:32,subscribers:null},metrics:{count:31,top:video,exclude1:3000.25,exclude3:2500,recent5:4200,recent10:4100,recent20:3900,samples:[5,10,20]},warnings:['전체 영상 32개 중 공개 영상 31개를 분석했습니다.'],started_at:batch.created_at,completed_at:batch.completed_at};
    let posted=false;
    server=http.createServer(async(req,res)=>{
      if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);}
      else if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css.css);}
      else if(req.url.startsWith('/api/')){
        res.setHeader('Content-Type','application/json');
        if(req.method==='POST'){posted=true;res.end(JSON.stringify({batchId:batch.id}));}
        else if(req.url.includes('runId'))res.end(JSON.stringify({videos:[video]}));
        else if(req.url.includes('batchId'))res.end(JSON.stringify({batch,runs:[run],requests:[{id:'1',input_url:'https://youtube.com/@한글',status:'completed'},{id:'2',input_url:'bad',status:'failed',error_code:'INVALID_URL'}]}));
        else res.end(JSON.stringify({runs:[run],batches:[batch]}));
      } else {res.setHeader('Content-Type','text/html');res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('배워야산다 채널',{exact:true}).waitFor();
    await page.getByText('https://www.youtube.com/@한글',{exact:true}).waitFor();
    await page.getByRole('button',{name:'더보기'}).click();
    await page.getByRole('dialog').getByText('123,456').waitFor();
    assert.equal(await page.getByRole('dialog').locator('tbody tr').count(),1);
    await page.keyboard.press('Escape');
    await page.getByLabel('분석할 YouTube URL').fill('https://youtube.com/@한글\nbad');
    await page.getByRole('button',{name:'새 분석 시작'}).click();
    await page.waitForURL('**?batchId=batch-1');
    assert.equal(posted,true);
    await page.getByText('일부 완료',{exact:true}).waitFor();
    await page.reload();
    await page.getByText('일부 완료',{exact:true}).waitFor();
    await fs.mkdir('.cache/youtube-analyzer',{recursive:true});
    await page.screenshot({path:'.cache/youtube-analyzer/desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.screenshot({path:'.cache/youtube-analyzer/mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: comparison, decoded URL, detail, new analysis, partial failure, reload restoration, desktop/mobile containment');
  } finally {if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
