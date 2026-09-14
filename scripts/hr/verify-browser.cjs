/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS verification harness. */
/* Actual HR React components + actual API route + PostgreSQL migrations.
   Only the auth transport is replaced with isolated, local test accounts. No production connections. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const esbuild = require('esbuild');
const { PGlite } = require('@electric-sql/pglite');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const browserPath = process.env.PLAYWRIGHT_PACKAGE_PATH || 'C:/Users/resum/AppData/Local/Programs/Python/Python311/Lib/site-packages/playwright/driver/package';
const { chromium } = createRequire(path.resolve('package.json'))(browserPath);
const sessions = new AsyncLocalStorage();

(async () => {
  const db = new PGlite(); let server; let browser; let activePage;
  const auth = [randomUUID(),randomUUID(),randomUUID(),randomUUID()];
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    for (const file of (await fs.readdir('supabase/migrations')).filter(name => /^20260914\d+_hr_/.test(name)).sort()) await db.exec(await fs.readFile(`supabase/migrations/${file}`,'utf8'));
    for (let i=0;i<4;i++) await db.query('insert into auth.users(id,email) values($1,$2)',[auth[i],`browser${i}@example.test`]);
    const org=(await db.query("select public.hr_bootstrap($1,'관리자','2020-01-01') id",[auth[0]])).rows[0].id;
    const employees=[(await db.query('select id from hr.employees where auth_id=$1',[auth[0]])).rows[0].id];
    for (let i=1;i<4;i++) employees.push((await db.query("insert into hr.employees(organization_id,auth_id,email,name,department,employment_start_date) values($1,$2,$3,$4,'운영','2020-01-01') returning id",[org,auth[i],`browser${i}@example.test`,['','직원 하나','직원 둘','직원 셋'][i]])).rows[0].id);
    const today=(await db.query('select hr.today()::text today')).rows[0].today;
    const monday=(await db.query('select (hr.today()+8-extract(isodow from hr.today())::integer)::text as target_day')).rows[0].target_day;
    let queue=Promise.resolve();
    async function rpc(name,args={}) {
      const employee=sessions.getStore();
      const operation=queue.then(async () => {
        try {
          return await db.transaction(async tx => {
            await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[auth[employee] || '']);
            await tx.exec(name==='hr_process_notifications'||name==='hr_generate_reminders' ? 'set local role service_role' : 'set local role authenticated');
            let result;
            if (name==='hr_query') result=await tx.query('select public.hr_query($1,$2::jsonb) data',[args.p_resource,JSON.stringify(args.p_filter)]);
            else if (name==='hr_command') result=await tx.query('select public.hr_command($1,$2::jsonb,$3::uuid) data',[args.p_action,JSON.stringify(args.p_body),args.p_key]);
            else if (name==='hr_process_notifications') result=await tx.query('select public.hr_process_notifications(500) data');
            else if (name==='hr_generate_reminders') result=await tx.query('select public.hr_generate_reminders() data');
            else throw new Error('Unexpected RPC '+name);
            return {data:result.rows[0].data,error:null};
          });
        } catch(error) { return {data:null,error:{code:error.code,message:error.message}}; }
      }); queue=operation.then(()=>undefined); return operation;
    }
    global.__hrTestClient={rpc,auth:{getClaims:async()=>({data:{claims:auth[sessions.getStore()] ? {sub:auth[sessions.getStore()],email:`browser${sessions.getStore()}@example.test`} : null}})}};
    const temp=path.resolve('tmp/hr-browser'); await fs.mkdir(temp,{recursive:true});
    const serverBuild=await esbuild.build({entryPoints:['src/app/api/hr/route.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false,plugins:[{name:'test-server-adapters',setup(build){
      build.onResolve({filter:/^(server-only|next\/server)$/},args=>({path:args.path,namespace:'adapter'}));
      build.onResolve({filter:/^@\/lib\/supabase\/(server|admin)$/},args=>({path:args.path,namespace:'adapter'}));
      build.onLoad({filter:/.*/,namespace:'adapter'},args=>({contents:args.path==='next/server'?'exports.after=()=>{}':args.path==='server-only'?'':`exports.createClient=async()=>global.__hrTestClient;exports.createAdminClient=()=>global.__hrTestClient;`,loader:'js'}));
    }}]});
    const apiPath=path.join(temp,'api.cjs'); await fs.writeFile(apiPath,serverBuild.outputFiles[0].text); const api=require(apiPath);
    const entry=`import React from 'react'; import {createRoot} from 'react-dom/client';
      import {HrShell} from './src/components/hr/shell'; import {TodayPage} from './src/components/hr/today'; import {TasksPage,TaskDetailPage} from './src/components/hr/tasks';
      import {LeavesPage} from './src/components/hr/leaves'; import {RecordsPage} from './src/components/hr/records'; import {AdminPage} from './src/components/hr/admin';
      import {NotificationsPage,ProfilePage} from './src/components/hr/notifications';
      const p=location.pathname; const View=p==='/hr'?TodayPage:p==='/hr/tasks'?TasksPage:p==='/hr/leaves'?LeavesPage:p==='/hr/records'?RecordsPage:p==='/hr/admin'?AdminPage:p==='/hr/notifications'?NotificationsPage:ProfilePage;
      createRoot(document.getElementById('root')).render(<HrShell context={window.__initial.context} directory={window.__initial.directory}>{p.startsWith('/hr/tasks/')?<TaskDetailPage id={p.split('/').pop()}/>:<View/>}</HrShell>);`;
    const bundle=await esbuild.build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',plugins:[{name:'test-browser-adapters',setup(build){
      build.onResolve({filter:/^next\/(link|navigation)$/},args=>({path:args.path,namespace:'client-adapter'}));
      build.onResolve({filter:/user-account-menu$/},args=>({path:args.path,namespace:'client-adapter'}));
      build.onLoad({filter:/.*/,namespace:'client-adapter'},args=>({contents:args.path==='next/link'?`import React from 'react'; export default function Link({href,children,prefetch,replace,...props}){return React.createElement('a',{...props,href},children)}`:args.path==='next/navigation'?`export const usePathname=()=>location.pathname;export const useRouter=()=>({push:(p)=>location.assign(p),replace:(p)=>location.replace(p),refresh:()=>location.reload()});`:`export const UserAccountMenu=()=>null;`,loader:'js',resolveDir:process.cwd()}));
    }}]});
    const css=await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});
    server=http.createServer(async (req,res)=>{
      const index=Number(/hr-test=(\d)/.exec(req.headers.cookie||'')?.[1] ?? -1);
      await sessions.run(index,async()=>{
        try {
          if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
          if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css.css);return;}
          const origin=`http://127.0.0.1:${server.address().port}`;
          if(req.url.startsWith('/api/hr')){
            const chunks=[];for await(const chunk of req)chunks.push(chunk);
            const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
            const result=await (req.method==='POST'?api.POST(request):api.GET(request));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
          }
          const context=await rpc('hr_query',{p_resource:'context',p_filter:{}});const directory=await rpc('hr_query',{p_resource:'directory',p_filter:{limit:100}});
          res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script>window.__initial=${JSON.stringify({context:context.data,directory:directory.data?.items??[]}).replace(/</g,'\\u003c')}</script><script src="/bundle.js"></script></body></html>`);
        } catch(error){res.statusCode=500;res.end(error.message);}
      });
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const origin=`http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:360,height:800}});const page=await context.newPage();activePage=page;const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message);});
    async function login(index,route='/hr'){await context.addCookies([{name:'hr-test',value:String(index),url:origin}]);await page.goto(origin+route);}
    const button=(name)=>page.getByRole('button',{name,exact:true});
    await login(1);assert.equal(await page.getByRole('navigation',{name:'HR 메뉴',exact:true}).getByRole('link',{name:'관리자',exact:true}).count(),0);await button('출근하기').click();await page.getByText('근무중',{exact:true}).waitFor();
    await button('업무 추가').click();await page.getByLabel('업무 이름',{exact:true}).fill('모바일 인수인계 업무');await page.getByLabel('상세내용',{exact:true}).fill('현재 상황과 다음 할 일');await page.getByRole('dialog').getByRole('button',{name:'업무 추가',exact:true}).click();
    await page.getByRole('link',{name:/모바일 인수인계 업무/}).click();await page.getByRole('heading',{name:'모바일 인수인계 업무',exact:true}).waitFor();
    await button('업무 이관').click();await page.getByLabel('새 담당자',{exact:true}).selectOption(employees[2]);await page.getByLabel('인수인계 메모',{exact:true}).fill('확인 후 고객에게 회신해 주세요.');await page.getByRole('dialog').getByRole('button',{name:'업무 이관',exact:true}).click();await page.getByText('담당 직원 둘',{exact:false}).waitFor();
    const taskUrl=page.url();await login(2,'/hr/tasks');await page.getByRole('link',{name:/모바일 인수인계 업무/}).waitFor();await page.goto(taskUrl);
    await page.getByLabel('변경할 상태',{exact:true}).selectOption('doing');await button('상태 변경').click();await page.getByText('진행중',{exact:true}).first().waitFor();
    await login(1,'/hr/leaves');await button('휴가 등록').click();await page.getByLabel('시작일',{exact:true}).fill(monday);await page.getByLabel('종료일',{exact:true}).fill(monday);await page.getByLabel('사용 단위',{exact:true}).selectOption('am');await page.getByLabel('휴가 사유 (본인·관리자만 조회)',{exact:true}).fill('개인 일정');await page.getByText('적용 미리보기 · 0.5일',{exact:true}).waitFor();await button('휴가 저장').click();await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.goto(origin+'/hr');await button('퇴근하기').click();await page.getByLabel('일일 메모 (선택)',{exact:true}).fill('이관 완료, 후속 확인 예정');await button('정리 저장 후 퇴근').click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByText('퇴근',{exact:true}).first().waitFor();
    await page.reload();await page.getByText('제출완료 · 1차',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'360px viewport should not overflow');
    await page.screenshot({path:path.join(temp,'mobile-today.png'),fullPage:true});
    await login(2);await button('출근하기').click();await button('퇴근하기').click();
    await page.getByLabel('일일 메모 (선택)',{exact:true}).fill('오류가 나도 이 메모는 유지됩니다');
    await page.route('**/api/hr',async route=>{if(route.request().method()==='POST' && route.request().postDataJSON()?.action==='review.submit')await route.fulfill({status:503,json:{error:'정리 저장 검증용 장애'}});else await route.continue();});
    await button('정리 저장 후 퇴근').click();await page.getByRole('alert').filter({hasText:'정리 저장 검증용 장애'}).waitFor();
    assert.equal(await page.getByLabel('일일 메모 (선택)',{exact:true}).inputValue(),'오류가 나도 이 메모는 유지됩니다');
    await button('정리는 나중에 하고 퇴근').click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.getByText('퇴근',{exact:true}).first().waitFor();await page.unroute('**/api/hr');
    await login(0);const adminMenu=page.getByRole('navigation',{name:'HR 메뉴',exact:true}).getByRole('link',{name:'관리자',exact:true});await adminMenu.waitFor();
    const menuBox=await adminMenu.boundingBox();assert.ok(menuBox && menuBox.x>=0 && menuBox.x+menuBox.width<=360,'administrator menu must be visible without horizontal scrolling at 360px');
    await adminMenu.click();await page.getByText('직원별 현황 · 대상 4명',{exact:true}).waitFor();await page.screenshot({path:path.join(temp,'mobile-admin.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(temp,'desktop-admin.png'),fullPage:true});
    await page.clock.install();
    await page.getByLabel('직원 이름',{exact:true}).fill('직원 하나');
    await page.getByText('직원별 현황 · 대상 1명',{exact:true}).waitFor();
    const refreshed = page.waitForResponse(response => response.url().includes('resource=admin') && response.status() === 200);
    await page.clock.runFor(31000); await refreshed;
    assert.equal(await page.getByLabel('직원 이름',{exact:true}).inputValue(),'직원 하나','automatic refresh must preserve entered filters');
    await button('직원 하나').click();await page.getByRole('heading',{name:'직원별 기록',exact:true}).waitFor();await page.getByText('이관 완료, 후속 확인 예정',{exact:true}).waitFor({state:'attached'});
    await sessions.run(0,()=>rpc('hr_process_notifications'));
    await login(0,'/hr/notifications');await page.getByText('휴가 등록',{exact:true}).waitFor();
    const forbidden=await page.request.post(origin+'/api/hr',{headers:{Origin:'https://untrusted.test','Idempotency-Key':randomUUID()},data:{action:'attendance.in',body:{}}});assert.equal(forbidden.status(),403);
    await login(3);const leak=await page.request.get(origin+'/api/hr?resource=task&id='+taskUrl.split('/').pop());assert.equal(leak.status(),404);
    assert.deepEqual(errors,[]);
    const summary={passed:true,today,checks:['360px check-in/task/transfer/leave/review/check-out','administrator menu visible at 360px and absent for employees','review failure retains input and allows independent checkout','30-second administrator refresh preserves input','two employee sessions and admin','reload persistence','private task access','CSRF rejection','outbox delivery'],screenshots:temp};
    await fs.writeFile(path.join(temp,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
  } catch(error) {
    if(activePage) { await activePage.screenshot({path:'tmp/hr-browser/failure.png',fullPage:true}); await fs.writeFile('tmp/hr-browser/failure.html',await activePage.content()); console.error((await activePage.locator('body').innerText()).slice(-4000)); }
    throw error;
  } finally {if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));await db.close();delete global.__hrTestClient;}
})().catch(error=>{console.error(error);process.exitCode=1;});
