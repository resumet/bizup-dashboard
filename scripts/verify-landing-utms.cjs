/* eslint-disable @typescript-eslint/no-require-imports -- Real API, PostgreSQL and browser regression harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const { build } = require('esbuild');
const { PGlite } = require('@electric-sql/pglite');
const writeXlsxFile = require('write-excel-file/node').default;
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
const W = '00000000-0000-4000-8000-000000000001', W2 = '00000000-0000-4000-8000-000000000002';
const U = '00000000-0000-4000-8000-000000000011', U2 = '00000000-0000-4000-8000-000000000012';
const C = '00000000-0000-4000-8000-000000000021', C2 = '00000000-0000-4000-8000-000000000022';
const headers = ['생성일', '유입 채널', '추천 코드', '진행 매체', 'URL', '단축 링크'];
const entry = (ref, medium = '유튜브', short = 'https://m.site.naver.com/2eCEA') => ['2026.08.18', '제휴', ref, medium, `https://www.bizupclass.com/free-courses/test?code=${encodeURIComponent(ref)}&channel=influencer&media=youtube`, short];
const workbook = rows => writeXlsxFile([headers, ...rows].map(row => row.map(value => ({ value, type: String })))).toBuffer();

(async () => {
  const db = new PGlite(); let browser, server, page; let user = { id: U }, base;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',banned_until timestamptz);
      create table workspaces(id uuid primary key); create table workspace_members(workspace_id uuid,user_id uuid,role text);
      create table courses(id uuid primary key,workspace_id uuid,name text,free_webinar_at timestamptz);
      create table audit_logs(id uuid default gen_random_uuid(),workspace_id uuid,actor_id uuid,event_type text,entity_type text,entity_id uuid,metadata jsonb);
      grant usage on schema auth to authenticated,service_role; grant select on courses to authenticated;
      grant all on all tables in schema public to service_role;
      insert into workspaces values('${W}'),('${W2}');
      insert into auth.users(id,email) values('${U}','one@example.test'),('${U2}','two@example.test');
      insert into workspace_members values('${W}','${U}','user'),('${W2}','${U2}','user');
      insert into courses values('${C}','${W}','검증 강의',now()),('${C2}','${W2}','별도 강의',now());`);
    await db.exec(await fs.readFile('supabase/migrations/20261008090358_shared_calendar.sql','utf8'));
    const migration = (await fs.readdir('supabase/migrations')).find(name => name.endsWith('_course_landing_utms.sql'));
    assert.ok(migration); await db.exec(await fs.readFile(`supabase/migrations/${migration}`,'utf8'));
    const rpc = async (course, actor, rows) => db.transaction(async tx => {
      await tx.exec('set local role service_role');
      return (await tx.query('select import_course_landing_utms($1,$2,$3::jsonb,$4) result',[course,actor,JSON.stringify(rows),'fixture.xlsx'])).rows[0].result;
    });
    const stored = async course => (await db.query('select id,channel,referral_code,medium,url,short_url from course_landing_utms where course_id=$1 order by referral_code',[course])).rows;
    const record = ref => ({channel:'제휴',referral_code:ref,medium:'유튜브',url:'https://example.test/landing',short_url:'https://example.test/short'});
    await assert.rejects(rpc(C,U2,[record('금지')]),/권한/);
    await rpc(C2,U2,[record('다른 워크스페이스')]);
    await assert.rejects(rpc(C,U,[record('부분 저장 금지'),{...record('잘못된 주소'),url:'javascript:test'}]));
    assert.equal((await stored(C)).length,0);
    await assert.rejects(rpc(C,U,[record('중복'),record('중복')]),/중복/);
    await assert.rejects(rpc(C,U,[{...record('누락'),medium:null}]),/형식/);
    await db.exec(`set request.jwt.claim.sub='${U}'; set role authenticated;`);
    assert.equal((await db.query('select * from course_landing_utms')).rows.length,0);
    await assert.rejects(db.query('insert into course_landing_utms(course_id,channel,referral_code,medium,url) values($1,$2,$3,$4,$5)',[C,'제휴','직접쓰기','유튜브','https://example.test']),/permission denied/);
    await assert.rejects(db.query('select import_course_landing_utms($1,$2,$3::jsonb,$4)',[C,U,JSON.stringify([record('금지')]),'test.xlsx']),/permission denied/);
    await db.exec('reset role; set role anon'); await assert.rejects(db.query('select * from course_landing_utms'),/permission denied/); await db.exec('reset role');

    // Actual route auth runs against this service-role Postgres adapter.
    const admin = { from(table) {
      let columns='*',conditions=[],orders=[],offset=0,limit,single=false,deleting=false;
      const query = { select(value='*'){columns=value;return query;},delete(){deleting=true;return query;},eq(key,value){conditions.push([key,value]);return query;},order(key){orders.push(key);return query;},range(start,end){offset=start;limit=end-start+1;return query;},maybeSingle(){single=true;return query;},
        then(resolve,reject){
          let sql=deleting?`delete from ${table}`:`select ${columns} from ${table}`;
          if(conditions.length)sql+=` where ${conditions.map(([key],i)=>`${key}=$${i+1}`).join(' and ')}`;
          if(orders.length)sql+=` order by ${orders.join(',')}`;
          if(limit)sql+=` limit ${limit} offset ${offset}`;
          if(deleting)sql+=` returning ${columns}`;
          return db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query(sql,conditions.map(([,value])=>value));}).then(result=>({data:single?result.rows[0]??null:result.rows,error:null})).catch(error=>({data:null,error})).then(resolve,reject);
        }
      }; return query;
    },async rpc(name,args){ assert.equal(name,'import_course_landing_utms');try{return {data:await rpc(args.p_course_id,args.p_actor_id,args.p_rows),error:null};}catch(error){return {data:null,error};} } };
    const fixture = { admin, async getUser(){
      if(!user)return null;
      const record=(await db.query('select raw_app_meta_data,banned_until from auth.users where id=$1',[user.id])).rows[0];
      return !record || record.raw_app_meta_data.account_disabled || (record.banned_until && new Date(record.banned_until)>new Date()) ? null : user;
    } };
    const mocks = {'server-only':'','@/lib/supabase/admin':'exports.createAdminClient=()=>fixture.admin;','@/lib/supabase/server':'exports.createClient=async()=>({});','@/lib/supabase/auth':'exports.getAuthenticatedUser=async()=>fixture.getUser();'};
    const backend = await build({entryPoints:['src/app/api/course-operations/[courseId]/landing-utms/route.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'services',setup(p){p.onResolve({filter:/.*/},a=>Object.hasOwn(mocks,a.path)?{path:a.path,namespace:'fixture'}:undefined);p.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}));}}]});
    const loaded={exports:{}};new Function('require','module','exports','fixture',backend.outputFiles[0].text)(require,loaded,loaded.exports,fixture);
    const frontend=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{createRoot}from'react-dom/client';import{CourseLandingUtms}from'./src/components/course-operations/course-landing-utms';createRoot(document.getElementById('root')).render(<main className="p-4"><CourseLandingUtms courseId="${C}"/></main>);`},bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env': '{}'}});
    const css=(await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css;
    server=http.createServer(async(req,res)=>{try{
      if(req.url.startsWith('/api/')){
        const bytes=[];for await(const chunk of req)bytes.push(chunk);
        const request=new Request(`${base}${req.url}`,{method:req.method,headers:req.headers,...(req.method==='GET'?{}:{body:Buffer.concat(bytes)})});
        const response=await loaded.exports[req.method](request,{params:Promise.resolve({courseId:req.url.split('/')[3]})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
      }
      res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':req.url==='/style.css'?'text/css':'text/html;charset=utf-8');
      res.end(req.url==='/bundle.js'?frontend.outputFiles[0].text:req.url==='/style.css'?css:'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');
    }catch(error){res.statusCode=500;res.end(error.message);}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
    const endpoint=`${base}/api/course-operations/${C}/landing-utms`;
    const post=async(buffer,extra={})=>{const form=new FormData();form.set('file',new File([buffer],'utm.xlsx'));return fetch(endpoint,{method:'POST',body:form,...extra});};
    user=null;assert.equal((await fetch(endpoint)).status,401);assert.equal((await post(await workbook([entry('권한')]))).status,401);user={id:U2};assert.equal((await fetch(endpoint)).status,403);user={id:U};
    assert.equal((await fetch(`${base}/api/course-operations/bad/landing-utms`)).status,400);
    assert.equal((await fetch(`${base}/api/course-operations/00000000-0000-4000-8000-000000000099/landing-utms`)).status,404);
    assert.equal((await post(await workbook([entry('권한')]),{headers:{origin:'https://evil.test'}})).status,403);
    const original=[entry('두시간부업만일로와'),entry('실전부업클럽'),entry('꿈꾸는사람들'),entry('초월스토리 '),...['무료강의 안내방','인스타그램'].map(m=>['2026.08.18','오가닉','비즈업클래스',m,`https://example.test/?media=${encodeURIComponent(m)}`,'https://m.site.naver.com/organic']),...['메타','구글'].map(m=>['2026.08.18','페이드','그로스임팩트',m,`https://example.test/?media=${encodeURIComponent(m)}`,'https://m.site.naver.com/paid'])];
    const initialBuffer=await workbook(original);
    browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']});page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.getByText('등록된 UTM이 없습니다.',{exact:false}).waitFor();
    const upload=async(buffer)=>{await page.getByLabel('UTM 엑셀 파일').setInputFiles({name:'utm.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});};
    await upload(initialBuffer);await page.getByText('추가 8건 · 업데이트 0건 · 변경 없음 0건을 반영했습니다.',{exact:true}).waitFor();await page.getByRole('cell',{name:'두시간부업만일로와',exact:true}).waitFor();assert.equal(await page.getByRole('row').count(),9);
    const ids=(await stored(C)).map(row=>row.id);await upload(initialBuffer);await page.getByText('추가 0건 · 업데이트 0건 · 변경 없음 8건을 반영했습니다.',{exact:true}).waitFor();assert.deepEqual((await stored(C)).map(row=>row.id),ids);
    const edited=entry('두시간부업만일로와','유튜브','https://m.site.naver.com/updated');edited[4]='https://example.test/new?channel=influencer&media=youtube';
    await upload(await workbook([edited,entry('신규추천','블로그','')]));await page.getByText('추가 1건 · 업데이트 1건 · 변경 없음 0건을 반영했습니다.',{exact:true}).waitFor();await page.getByRole('cell',{name:'신규추천',exact:true}).waitFor();assert.equal(await page.getByRole('row').count(),10);
    const changed=(await stored(C)).find(row=>row.referral_code==='두시간부업만일로와');assert.equal(changed.url,edited[4]);assert.equal(changed.short_url,edited[5]);assert.ok(ids.includes(changed.id));assert.equal((await stored(C2)).length,1);
    const link=page.getByRole('link',{name:'두시간부업만일로와 유튜브 단축링크 바로가기'});assert.equal(await link.getAttribute('href'),edited[5]);assert.equal(await link.getAttribute('target'),'_blank');
    const shortCopy=page.getByRole('button',{name:'두시간부업만일로와 유튜브 단축링크 복사하기'});
    assert.equal(await link.textContent(),'');assert.equal(await shortCopy.textContent(),'');
    assert.ok(Math.abs((await link.boundingBox()).y-(await shortCopy.boundingBox()).y)<1,'Short-link icons must share one line');
    await shortCopy.click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),edited[5]);
    assert.ok(!(await page.getByRole('table').textContent()).includes(edited[4]),'Full URLs must not appear in the table');
    const urlButton=page.getByRole('button',{name:'두시간부업만일로와 유튜브 URL 보기'});
    await urlButton.click();const dialog=page.getByRole('dialog',{name:'랜딩페이지 URL'});
    assert.equal(await dialog.getByLabel('전체 URL').textContent(),edited[4]);
    await dialog.getByRole('button',{name:'복사하기',exact:true}).click();await dialog.getByRole('status').filter({hasText:'URL을 복사했습니다.'}).waitFor();
    assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),edited[4]);
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await urlButton.evaluate(button=>button===document.activeElement),true);
    const prior=await stored(C);await upload(await workbook([entry('정상행'),entry('실패행','유튜브','javascript:test')]));await page.getByRole('alert').filter({hasText:'3행 단축 링크'}).waitFor();assert.deepEqual(await stored(C),prior);
    await page.reload();await page.getByRole('cell',{name:'신규추천',exact:true}).waitFor();assert.equal(await page.getByRole('row').count(),10);
    await fs.mkdir('tmp/landing-utms',{recursive:true});await page.screenshot({path:'tmp/landing-utms/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tmp/landing-utms/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));assert.deepEqual(errors,[]);
    await page.getByRole('button',{name:'실전부업클럽 유튜브 URL 보기'}).click();await dialog.waitFor();
    assert.equal(await dialog.getByLabel('전체 URL').textContent(),original[1][4]);
    assert.ok(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth),'Mobile URL dialog must fit its viewport');
    await dialog.getByRole('button',{name:'복사하기',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),original[1][4]);
    await page.screenshot({path:'tmp/landing-utms/mobile-url-dialog.png',fullPage:true});await page.keyboard.press('Escape');
    const remove=(id,extra={})=>fetch(endpoint,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id}),...extra});
    const candidate=(await stored(C)).find(row=>row.referral_code==='신규추천');
    user=null;assert.equal((await remove(candidate.id)).status,401);user={id:U2};assert.equal((await remove(candidate.id)).status,403);user={id:U};
    assert.equal((await remove(candidate.id,{headers:{'content-type':'application/json',origin:'https://evil.test'}})).status,403);
    assert.equal((await remove('invalid')).status,400);
    assert.equal((await remove((await stored(C2))[0].id)).status,404);assert.equal((await stored(C2)).length,1);
    assert.equal((await remove('00000000-0000-4000-8000-000000000099')).status,404);
    const deleteButton=page.getByRole('button',{name:'신규추천 블로그 UTM 삭제'});
    assert.equal(await deleteButton.textContent(),'');assert.ok(await deleteButton.evaluate(button=>button.closest('td')===button.closest('tr').lastElementChild));
    await deleteButton.click();const deleteDialog=page.getByRole('dialog',{name:'UTM 삭제',exact:true});await deleteDialog.waitFor();
    await deleteDialog.getByRole('button',{name:'취소',exact:true}).click();assert.equal((await stored(C)).length,9);
    await deleteButton.click();await db.exec('revoke delete on public.course_landing_utms from service_role');
    await deleteDialog.getByRole('button',{name:'삭제',exact:true}).click();await deleteDialog.getByRole('alert').filter({hasText:'삭제하지 못했습니다'}).waitFor();assert.equal((await stored(C)).length,9);
    await db.exec('grant delete on public.course_landing_utms to service_role');
    await deleteDialog.getByRole('button',{name:'삭제',exact:true}).click();await deleteDialog.waitFor({state:'hidden'});
    assert.equal((await stored(C)).length,8);assert.equal(await page.getByRole('cell',{name:'신규추천',exact:true}).count(),0);
    await page.reload();await page.getByRole('button',{name:'두시간부업만일로와 유튜브 URL 보기'}).waitFor();assert.equal(await page.getByRole('row').count(),9);
    assert.equal((await remove(candidate.id)).status,404);
    // An explicit later Excel upload may register a deleted combination again.
    assert.equal((await post(await workbook([entry('신규추천','블로그','')]))).status,200);assert.equal((await stored(C)).length,9);
    // Read policies and import auth also reject an account disabled after login.
    await db.exec(`set request.jwt.claim.sub='${U}'; set role authenticated;`);assert.equal((await db.query('select * from course_landing_utms')).rows.length,9);await db.exec('reset role');
    await db.query("update auth.users set raw_app_meta_data=$1::jsonb where id=$2",[JSON.stringify({account_disabled:true}),U]);
    assert.equal((await post(await workbook([entry('비활성')]))).status,401);
    assert.equal((await remove(changed.id)).status,401);
    await db.exec(`set request.jwt.claim.sub='${U}'; set role authenticated;`);assert.equal((await db.query('select * from course_landing_utms')).rows.length,0);await db.exec('reset role');
    assert.deepEqual(errors,[]);
    console.log('PASS: real XLSX → API → PostgreSQL → UI; imports, URL/copy and mobile layout; deletion icon, cancel, failure/retry, persistence, re-import, course isolation and auth/CSRF/disabled-account checks.');
  }catch(error){if(page)console.error((await page.locator('body').innerText()).slice(-1800));throw error;}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
