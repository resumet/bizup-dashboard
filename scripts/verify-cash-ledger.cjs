/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser/API/Postgres regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const { build } = require('esbuild');
const { PGlite } = require('@electric-sql/pglite');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const sharp = require('sharp');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
const W = '00000000-0000-4000-8000-000000000001', U = '00000000-0000-4000-8000-000000000011';
const C = '00000000-0000-4000-8000-000000000021';

// Supabase's small query surface backed by real PostgreSQL, with actual RLS and triggers.
function client(database, role, storage) {
  return { storage, from(table) {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid test table');
    let operation = 'select', values, columns = '*', conditions = [], ordering = [], offset = 0, limit, single = false;
    const query = {
      select(value = '*') { columns = value; return query; },
      eq(column, value) { conditions.push([column, value]); return query; },
      order(column, options) { ordering.push(`${column} ${options?.ascending === false ? 'desc' : 'asc'}`); return query; },
      range(start, end) { offset = start; limit = end - start + 1; return query; },
      insert(value) { operation = 'insert'; values = value; return query; },
      update(value) { operation = 'update'; values = value; return query; },
      delete() { operation = 'delete'; return query; },
      single() { single = true; return query; }, maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        const params = [], bind = value => { params.push(value); return `$${params.length}`; };
        let sql;
        if (operation === 'select') sql = `select ${columns} from ${table}`;
        if (operation === 'insert') sql = `insert into ${table} (${Object.keys(values).join(',')}) values (${Object.values(values).map(bind).join(',')})`;
        if (operation === 'update') sql = `update ${table} set ${Object.entries(values).map(([key, value]) => `${key}=${bind(value)}`).join(',')}`;
        if (operation === 'delete') sql = `delete from ${table}`;
        if (conditions.length) sql += ` where ${conditions.map(([key, value]) => `${key}=${bind(value)}`).join(' and ')}`;
        if (operation === 'select') { if (ordering.length) sql += ` order by ${ordering.join(',')}`; if (limit) sql += ` limit ${limit} offset ${offset}`; }
        else sql += ` returning ${columns}`;
        return database.transaction(async tx => {
          await tx.exec(`set local role ${role}; set local request.jwt.claim.sub='${U}'`);
          const result = await tx.query(sql, params);
          // PostgREST serializes SQL dates as YYYY-MM-DD and int8 as JSON numbers.
          const rows = result.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Date ? (key.endsWith('_date') ? value.toISOString().slice(0, 10) : value.toISOString()) : typeof value === 'bigint' ? Number(value) : value])));
          return { data: single ? rows[0] ?? null : rows, error: null };
        }).catch(error => ({ data: null, error: { code: error.code, message: error.message } })).then(resolve, reject);
      },
    }; return query;
  } };
}

(async () => {
  let browser, server, page;
  const database = new PGlite(); const blobs = new Map(); let base;
  try {
    await database.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',banned_until timestamptz);
      create table workspaces(id uuid primary key); create table workspace_members(workspace_id uuid,user_id uuid,role text);
      create table courses(id uuid primary key,workspace_id uuid,name text,status text,instructor_name text,cohort text);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      grant usage on schema auth to authenticated, service_role; grant select on courses to authenticated,service_role;
      insert into workspaces values('${W}'); insert into auth.users(id,email) values('${U}','fixture@example.invalid'); insert into workspace_members values('${W}','${U}','user');
      insert into courses values('${C}','${W}','진행 강의','ongoing','강사','1');
      insert into courses values('00000000-0000-4000-8000-000000000022','${W}','완료 강의','completed','강사','2');
      insert into courses values('00000000-0000-4000-8000-000000000023','${W}','취소 강의','canceled','다른강사','3기');
      insert into courses values('00000000-0000-4000-8000-000000000024','${W}','보류 강의','on_hold','다른강사','4');`);
    await database.exec('alter table courses add column free_webinar_at timestamptz');
    await database.exec(await fs.readFile('supabase/migrations/20261008090358_shared_calendar.sql','utf8'));
    await database.exec(await fs.readFile('supabase/migrations/20261015063730_cash_ledger.sql','utf8'));
    const storage = { from() { return {
      async upload(path, file) { blobs.set(path, Buffer.from(await file.arrayBuffer())); return { error: null }; },
      async remove(paths) { paths.forEach(path => blobs.delete(path)); return { error: null }; },
      async createSignedUrl(path) { return { data: { signedUrl: `${base}/files/${encodeURIComponent(path)}` }, error: null }; },
    }; } };
    const approval = { status:'approved',transactionCount:1,amount:200000,currency:'KRW',merchantName:'주식회사 앤스페이스',year:null,month:10,day:19 };
    const fixture = { user: { id: U }, db: client(database,'authenticated',storage), admin: client(database,'service_role',storage), approval, analysisCalls:0, analysisDelay:0 };
    process.env.OPENAI_API_KEY = 'isolated-test-key';
    process.env.OPENAI_VISION_MODEL = 'isolated-test-model';
    const mocks = {
      'server-only': '',
      '@/lib/supabase/server': 'exports.createClient=async()=>fixture.db;',
      '@/lib/supabase/admin': 'exports.createAdminClient=()=>fixture.admin;',
      '@/lib/supabase/auth': 'exports.getAuthenticatedUser=async()=>fixture.user;',
      '@/lib/course-operations/server': `exports.requireCourseOperationsMembership=async()=>({workspace_id:'${W}'});`,
      '@ai-sdk/openai': 'exports.openai=model=>model;',
      'ai': `exports.Output={object:config=>config};exports.APICallError={isInstance:()=>false};exports.generateText=async options=>{fixture.analysisCalls++;fixture.analysisOptions=options;if(fixture.analysisDelay)await new Promise(resolve=>setTimeout(resolve,fixture.analysisDelay));return {output:options.output.schema.parse(fixture.approval)};};`,
    };
    const routeNames = ['', '/settings', '/parties', '/parties/[partyId]', '/entries', '/entries/[entryId]', '/entries/[entryId]/attachments', '/entries/[entryId]/attachments/[attachmentId]', '/analyze-receipt', '/parties/resolve'];
    const backend = await build({ stdin: { resolveDir: process.cwd(), contents: routeNames.map((path,index)=>`export * as route${index} from './src/app/api/cash-ledger${path}/route';`).join('\n'), loader:'ts' },bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fixtures',setup(plugin){plugin.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'fixture'}:undefined);plugin.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'js'}));}}] });
    const loaded = { exports: {} }; new Function('require','module','exports','fixture',backend.outputFiles[0].text)(require,loaded,loaded.exports,fixture);
    const frontend = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react'; import {createRoot} from 'react-dom/client'; import {LedgerWorkspace} from './src/components/cash-ledger/ledger-workspace'; createRoot(document.getElementById('root')).render(<main className="p-5"><LedgerWorkspace/></main>);`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
    const css = await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'});
    server = http.createServer(async(req,res)=>{
      try {
        if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(frontend.outputFiles[0].text);return;}
        if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css.css);return;}
        if(req.url.startsWith('/files/')){res.end(blobs.get(decodeURIComponent(req.url.slice(7))));return;}
        if(!req.url.startsWith('/api/')){res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');return;}
        const path = req.url.slice('/api/cash-ledger'.length).split('?')[0];
        let routeIndex=routeNames.indexOf(path), params={};
        if(routeIndex<0){const segments=path.split('/').filter(Boolean);params=segments[0]==='parties'?{partyId:segments[1]}:{entryId:segments[1],attachmentId:segments[3]};routeIndex=segments[0]==='parties'?3:segments.length===2?5:segments.length===3?6:7;}
        const bytes=[];for await(const chunk of req)bytes.push(chunk);
        const request=new Request(`${base}${req.url}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(bytes)})});
        const response=await loaded.exports[`route${routeIndex}`][req.method](request,{params:Promise.resolve(params)});
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
      }catch(error){console.error(error);res.statusCode=500;res.end(JSON.stringify({message:error.message}));}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
    fixture.user=null;assert.equal((await fetch(`${base}/api/cash-ledger`)).status,401);fixture.user={id:U};
    assert.equal((await fetch(`${base}/api/cash-ledger/settings`,{method:'PUT',headers:{origin:'https://evil.test','content-type':'application/json'},body:'{}'})).status,403);
    browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1600,height:1100}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    await page.getByRole('button',{name:'시작 잔고 등록',exact:true}).first().click();
    await page.getByLabel('기록 시작일').fill('2026-10-10');await page.getByLabel('은행 잔고').fill('1000000');await page.getByRole('button',{name:'시작 잔고 저장'}).click();
    await page.getByText('전체 잔액',{exact:true}).waitFor();
    await page.getByRole('button',{name:'거래처 관리',exact:true}).click();
    await page.getByLabel('거래처명',{exact:true}).fill('테스트 거래처');await page.getByLabel('은행명').fill('테스트은행');await page.getByLabel('계좌번호').fill('123-456');await page.getByLabel('예금주').fill('홍길동');await page.getByRole('button',{name:'거래처 등록',exact:true}).click();
    await page.getByRole('button',{name:/테스트 거래처/}).click();await page.getByLabel('계좌번호').fill('123-789');await page.getByRole('button',{name:'거래처 수정 저장'}).click();await page.getByRole('button',{name:/123-789/}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
    async function fillEntry(title,kind,amount,day,note){await page.getByRole('button',{name:'내역 등록',exact:true}).click();await page.getByLabel('제목',{exact:true}).fill(title);await page.getByLabel('구분',{exact:true}).selectOption(kind);await page.getByLabel('지급대상',{exact:true}).selectOption({label:'테스트 거래처'});await page.getByLabel('지급/입금금액 (원)',{exact:true}).fill(amount);await page.getByLabel('날짜',{exact:true}).fill(day);await page.getByLabel('비고',{exact:true}).fill(note);}
    await fillEntry('첫 입금','income','200000','2026-10-11','입금 메모');
    assert.equal(await page.getByLabel('지급/입금금액 (원)',{exact:true}).inputValue(),'200,000');
    assert.deepEqual(await page.getByLabel('관련 강의 (선택)',{exact:true}).locator('option:not([hidden])').allTextContents(),['선택 안 함','(진행)강사-진행 강의-1기','(완료)강사-완료 강의-2기','(취소)다른강사-취소 강의-3기','(보류)다른강사-보류 강의-4기']);
    await page.getByRole('button',{name:/파일첨부/}).click();
    await page.getByRole('dialog').last().evaluate(node=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array([137,80,78,71])],'clipboard.png',{type:'image/png'}));node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
    await page.getByText('저장 대기',{exact:true}).waitFor();await page.getByRole('button',{name:'첨부 확인',exact:true}).click();await page.getByRole('button',{name:'내역 저장',exact:true}).click();await page.getByRole('button',{name:'첫 입금',exact:true}).waitFor();assert.equal(blobs.size,1);
    await fillEntry('강의 지출','expense','50000','2026-10-12','영수증 확인');await page.getByLabel('관련 강의 (선택)',{exact:true}).selectOption('00000000-0000-4000-8000-000000000022');await page.getByRole('button',{name:'내역 저장',exact:true}).click();await page.getByRole('button',{name:'강의 지출',exact:true}).waitFor();
    assert.match(await page.getByText('전체 잔액',{exact:true}).locator('..').textContent(),/1,150,000/);
    assert.match(await page.getByRole('row').nth(1).textContent(),/강의 지출/);
    for(const term of ['첫 입금','테스트 거래처','완료 강의','50,000','영수증 확인']){await page.getByLabel('입출금 내역 검색').fill(term);assert.ok(await page.getByRole('row').count()>1);assert.match(await page.getByText('전체 잔액',{exact:true}).locator('..').textContent(),/1,150,000/);}
    await page.getByLabel('입출금 내역 검색').fill('');await page.getByRole('button',{name:'강의 지출',exact:true}).click();await page.getByLabel('지급/입금금액 (원)',{exact:true}).fill('80000');await page.getByRole('button',{name:'내역 저장',exact:true}).click();await page.getByRole('button',{name:'강의 지출',exact:true}).waitFor();assert.match(await page.getByText('전체 잔액',{exact:true}).locator('..').textContent(),/1,120,000/);
    await page.getByRole('button',{name:'첫 입금',exact:true}).click();await page.getByRole('button',{name:/파일첨부/}).click();const fileLink=page.getByRole('link',{name:'clipboard.png'});await fileLink.waitFor();assert.equal((await fetch(`${base}${await fileLink.getAttribute('href')}`)).status,200);await page.getByRole('button',{name:'첨부 확인',exact:true}).click();await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('button',{name:'삭제 확정',exact:true}).click();await page.getByRole('button',{name:'내역 등록',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));assert.match(await page.getByText('전체 잔액',{exact:true}).locator('..').textContent(),/920,000/);assert.equal(blobs.size,0);
    await page.reload();await page.getByRole('button',{name:'강의 지출',exact:true}).waitFor();assert.match(await page.getByText('전체 잔액',{exact:true}).locator('..').textContent(),/920,000/);
    await fs.mkdir('tmp/cash-ledger',{recursive:true});
    await page.screenshot({path:'tmp/cash-ledger/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tmp/cash-ledger/mobile.png',fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));assert.deepEqual(errors,[]);
    const state=(await (await fetch(`${base}/api/cash-ledger`)).json()).state;
    assert.equal(state.entries[0].courseId,'00000000-0000-4000-8000-000000000022');
    await page.getByRole('button',{name:'강의 지출',exact:true}).click();
    assert.equal(await page.getByLabel('관련 강의 (선택)',{exact:true}).inputValue(),'00000000-0000-4000-8000-000000000022');
    await page.getByLabel('관련 강의 (선택)',{exact:true}).selectOption('00000000-0000-4000-8000-000000000023');
    await page.getByRole('button',{name:'내역 저장',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
    assert.equal((await (await fetch(`${base}/api/cash-ledger`)).json()).state.entries[0].courseId,'00000000-0000-4000-8000-000000000023');
    const payload={...state.entries[0],requestId:crypto.randomUUID(),title:'재시도 방지'};delete payload.id;
    const send=()=>fetch(`${base}/api/cash-ledger/entries`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    assert.equal((await send()).status,201);assert.equal((await send()).status,201);
    assert.equal(Number((await database.query("select count(*) as count from cash_ledger_entries where title='재시도 방지'")).rows[0].count),1);
    await database.query(`insert into cash_ledger_entries(workspace_id,kind,title,party_id,amount,entry_date) select $1,'income','페이지 확인 ' || n,$2,1,'2026-10-15' from generate_series(1,1001) n`,[W,state.parties[0].id]);
    const paged=(await (await fetch(`${base}/api/cash-ledger`)).json()).state;
    assert.equal(paged.entries.length,1003);
    assert.equal(new Set(paged.entries.map(entry=>entry.id)).size,1003);

    // Exercise the real image decoder, route, validation and UI; only the AI response is mocked.
    const receiptImage=await sharp({create:{width:277,height:255,channels:3,background:'#bed0de'}}).png().toBuffer();
    const analyze=async(file=new File([receiptImage],'approval.png',{type:'image/png'}),headers={})=>{const form=new FormData();form.set('file',file);return fetch(`${base}/api/cash-ledger/analyze-receipt`,{method:'POST',headers,body:form});};
    fixture.user=null;assert.equal((await analyze()).status,401);fixture.user={id:U};
    assert.equal((await analyze(undefined,{origin:'https://evil.test'})).status,403);
    assert.equal((await analyze(new File(['not an image'],'fake.png',{type:'image/png'}))).status,400);
    assert.equal(fixture.analysisCalls,0);
    assert.equal((await analyze(new File([new Uint8Array(4194305)],'large.png',{type:'image/png'}))).status,400);
    const analyzed=await analyze();assert.equal(analyzed.status,200);
    const year=new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric'}).format(new Date());
    assert.deepEqual((await analyzed.json()).analysis,{kind:'expense',amount:200000,partyName:'주식회사 앤스페이스',entryDate:`${year}-10-19`,yearInferred:true});
    assert.equal(fixture.analysisOptions.providerOptions.openai.store,false);
    assert.equal(fixture.analysisOptions.messages[0].content[1].mediaType,'image/png');
    for(const invalid of [{status:'canceled'},{transactionCount:2},{amount:null},{month:2,day:30},{merchantName:null},{currency:'USD'}]){
      fixture.approval={...approval,...invalid};assert.equal((await analyze()).status,422);
    }
    fixture.approval=approval;
    const partyCount=async()=>Number((await database.query("select count(*) as count from cash_ledger_parties where name='주식회사 앤스페이스'")).rows[0].count);
    const pasteReceipt=()=>page.getByRole('group',{name:'카드 승인 이미지 붙여넣기',exact:true}).evaluate((node,bytes)=>{const data=new DataTransfer();data.items.add(new File([Uint8Array.from(bytes)],'approval.png',{type:'image/png'}));node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},[...receiptImage]);
    await page.getByRole('button',{name:'내역 등록',exact:true}).click();await pasteReceipt();
    await page.getByText(/승인 내역을 입력했습니다/).waitFor();
    assert.equal(await page.getByLabel('구분',{exact:true}).inputValue(),'expense');
    assert.equal(await page.getByLabel('날짜',{exact:true}).inputValue(),`${year}-10-19`);
    assert.equal(await page.getByLabel('지급/입금금액 (원)',{exact:true}).inputValue(),'200,000');
    assert.equal(await page.getByLabel('제목',{exact:true}).inputValue(),'');
    assert.equal(await page.getByLabel('새 지급대상 이름',{exact:false}).inputValue(),'주식회사 앤스페이스');
    assert.equal(await partyCount(),0);
    await page.getByRole('button',{name:'내역 저장',exact:true}).click();assert.equal(await partyCount(),0);
    assert.equal(await page.getByLabel('제목',{exact:true}).evaluate(node=>node.validity.valueMissing),true);
    await page.getByLabel('제목',{exact:true}).fill('   ');await page.getByRole('button',{name:'내역 저장',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'제목을 입력'}).waitFor();assert.equal(await partyCount(),0);
    await page.getByLabel('제목',{exact:true}).fill('');
    await page.getByRole('group',{name:'카드 승인 이미지 붙여넣기',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:'tmp/cash-ledger/receipt-mobile.png',fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    await page.setViewportSize({width:1600,height:1100});
    await page.screenshot({path:'tmp/cash-ledger/receipt-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await partyCount(),0);

    await page.getByRole('button',{name:'내역 등록',exact:true}).click();await pasteReceipt();await page.getByText(/승인 내역을 입력했습니다/).waitFor();
    await page.getByLabel('제목',{exact:true}).fill('카드 승인 자동 입력');
    await page.getByRole('button',{name:'내역 저장',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
    assert.equal(await partyCount(),1);
    const persisted=(await (await fetch(`${base}/api/cash-ledger`)).json()).state;
    const approvedEntry=persisted.entries.find(entry=>entry.title==='카드 승인 자동 입력');
    assert.equal(approvedEntry.amount,200000);assert.equal(approvedEntry.kind,'expense');assert.equal(approvedEntry.entryDate,`${year}-10-19`);
    assert.equal(persisted.parties.find(party=>party.id===approvedEntry.partyId).name,'주식회사 앤스페이스');
    const resolve=()=>fetch(`${base}/api/cash-ledger/parties/resolve`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:' 주식회사앤스페이스 '})});
    assert.equal((await (await resolve()).json()).party.id,approvedEntry.partyId);
    assert.equal((await (await resolve()).json()).party.id,approvedEntry.partyId);assert.equal(await partyCount(),1);
    await page.reload();await page.getByRole('button',{name:'내역 등록',exact:true}).click();await pasteReceipt();await page.getByText(/승인 내역을 입력했습니다/).waitFor();
    assert.equal(await page.getByLabel('지급대상',{exact:true}).inputValue(),approvedEntry.partyId);
    assert.equal(await page.getByLabel('새 지급대상 이름',{exact:false}).count(),0);
    await page.getByLabel('제목',{exact:true}).fill('직접 작성한 제목');
    fixture.approval={...approval,status:'canceled'};await page.getByRole('button',{name:'이미지 다시 분석',exact:true}).click();await page.getByRole('alert').filter({hasText:'승인 취소'}).waitFor();
    assert.equal(await page.getByLabel('지급/입금금액 (원)',{exact:true}).inputValue(),'200,000');
    assert.equal(await page.getByLabel('제목',{exact:true}).inputValue(),'직접 작성한 제목');
    fixture.approval=approval;fixture.analysisDelay=800;
    await page.getByRole('button',{name:'이미지 다시 분석',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'내역 저장',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'분석 취소',exact:true}).click();
    await page.getByLabel('지급/입금금액 (원)',{exact:true}).fill('12345');
    await new Promise(resolve=>setTimeout(resolve,1000));
    assert.equal(await page.getByLabel('지급/입금금액 (원)',{exact:true}).inputValue(),'12,345');
    fixture.analysisDelay=0;
    await page.getByRole('button',{name:'이미지 다시 분석',exact:true}).click();await page.getByText(/승인 내역을 입력했습니다/).waitFor();
    assert.equal(await page.getByLabel('제목',{exact:true}).inputValue(),'직접 작성한 제목');
    const callsBeforeInvalidFile=fixture.analysisCalls;
    await page.getByLabel('카드 승인 이미지 선택',{exact:true}).setInputFiles({name:'receipt.pdf',mimeType:'application/pdf',buffer:Buffer.from('pdf')});
    await page.getByRole('alert').filter({hasText:'이미지를 선택'}).waitFor();assert.equal(fixture.analysisCalls,callsBeforeInvalidFile);
    await page.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await partyCount(),1);
    assert.deepEqual(errors,[]);
    console.log('PASS: browser → actual API → PostgreSQL/RLS; ledger regression plus receipt paste/preview/autofill, required manual title, deferred party creation, reuse/retry, canceled/invalid receipts, analysis cancellation, responsive layout and auth/CSRF. AI output is mocked; no live AI call.');
  }catch(error){if(page)console.error((await page.locator("body").innerText()).slice(-2500));throw error;}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await database.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
