/* eslint-disable @typescript-eslint/no-require-imports -- Local browser/DB integration harness. */
// Real course editor, dashboard, API handlers and SQL. Only Next navigation and Supabase transport are adapted.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const esbuild = require('esbuild');
const { PGlite } = require('@electric-sql/pglite');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'C:/Users/resum/AppData/Local/Programs/Python/Python311/Lib/site-packages/playwright/driver/package');

(async () => {
  const db = new PGlite();
  const owner = randomUUID(), outsider = randomUUID(), workspace = randomUUID(), first = randomUUID(), second = randomUUID();
  const sessions = new AsyncLocalStorage();
  const temp = path.resolve('tmp/webinar-browser');
  let browser, server, activePage;
  try {
    await fs.mkdir(temp, { recursive: true });
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.courses(id uuid primary key,workspace_id uuid not null,name text,instructor_name text,free_webinar_at timestamptz);
      create table public.workspace_members(workspace_id uuid,user_id uuid);
      create function public.is_workspace_member(w uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid())$$;
      alter table public.courses enable row level security;
      create policy members on public.courses for select to authenticated using(public.is_workspace_member(workspace_id));
      grant select on public.courses to authenticated;`);
    await db.query("insert into public.workspace_members values($1,$2)", [workspace, owner]);
    await db.query("insert into public.courses values($1,$3,'첫 번째 웨비나','강사 하나','2026-09-15T10:00:00Z'),($2,$3,'두 번째 웨비나','강사 둘','2026-09-14T10:00:00Z')", [first, second, workspace]);
    await db.query("insert into public.courses select gen_random_uuid(),$1,'과거 강의 '||n,'과거 강사','2026-08-01T00:00:00Z' from generate_series(1,499) n", [workspace]);
    await db.exec(await fs.readFile('supabase/migrations/202609150001_course_webinar_metrics.sql', 'utf8'));
    async function query(sql, values = []) {
      return db.transaction(async tx => {
        await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [sessions.getStore()?.user?.id ?? '']);
        await tx.exec('set local role authenticated');
        return tx.query(sql, values);
      });
    }
    global.__webinarSessions = sessions;
    global.__webinarClient = {
      from(table) {
        const state = { table, columns: '*', offset: 0, limit: 500 };
        const builder = {
          select(columns) { state.columns = columns; return builder; },
          eq(key, value) { assert.ok(['id', 'course_id'].includes(key)); state.key = key; state.value = value; return builder; },
          order() { return builder; },
          range(start, end) { state.offset = start; state.limit = end - start + 1; return builder; },
          maybeSingle() { state.single = true; return builder; },
          async then(resolve) {
            try {
              let result;
              if (state.table === 'courses' && state.columns.includes('course_webinar_metrics')) {
                result = await query('select c.id,c.name,c.instructor_name,c.free_webinar_at,to_jsonb(m) course_webinar_metrics from courses c left join course_webinar_metrics m on m.course_id=c.id order by c.free_webinar_at desc,c.id limit $1 offset $2', [state.limit, state.offset]);
              } else {
                assert.ok(['courses', 'course_webinar_metrics'].includes(state.table));
                result = await query(`select * from ${state.table} where ${state.key}=$1`, [state.value]);
              }
              return resolve({ data: state.single ? result.rows[0] ?? null : result.rows, error: null });
            } catch (error) { return resolve({ data: null, error: { code: error.code, message: error.message } }); }
          },
        };
        return builder;
      },
      async rpc(name, args) {
        assert.equal(name, 'save_course_webinar_metrics');
        try {
          const result = await query('select to_jsonb(public.save_course_webinar_metrics($1,$2,$3)) result', [args.p_course_id, JSON.stringify(args.p_metrics), args.p_expected_version]);
          return { data: result.rows[0].result, error: null };
        } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
      },
    };
    const serverPlugins = [{ name: 'local-auth-transport', setup(build) {
      build.onResolve({ filter: /^(server-only|@\/lib\/supabase\/(server|auth))$/ }, args => ({ path: args.path, namespace: 'auth-adapter' }));
      build.onLoad({ filter: /.*/, namespace: 'auth-adapter' }, args => ({ contents: args.path === 'server-only' ? '' : args.path.endsWith('/auth') ? 'export async function getAuthenticatedUser(){return global.__webinarSessions.getStore()?.user ?? null}' : 'export async function createClient(){return global.__webinarClient}', loader: 'js' }));
    }}];
    const apis = {};
    for (const [key, source] of Object.entries({ course: 'src/app/api/course-operations/[courseId]/webinar/route.ts', list: 'src/app/api/course-webinars/route.ts' })) {
      const bundle = await esbuild.build({ entryPoints: [source], platform: 'node', format: 'cjs', bundle: true, write: false, plugins: serverPlugins });
      const output = path.join(temp, `${key}.cjs`); await fs.writeFile(output, bundle.outputFiles[0].text); apis[key] = require(output);
    }
    const draft = { name: '첫 번째 웨비나', instructorName: '강사 하나', freeWebinarAt: '2026-09-15T10:00:00Z', startsAt: '2026-09-20T00:00:00Z', earlyBirdEvent: '', first50Event: '', courseDifferentiation: '', landingPageLink: '', freeKakaoRoom1Link: '', freeKakaoRoom2Link: '', communicationRoomLink: '', paymentLink: '', inquiryLink: '', curriculumLink: '', freeGiftLink: '', courseViewingLink: '', courseMaterialsLink: '', customLinks: [], options: [], youtubeAppearances: [], liveVideos: [], rosterJobIds: [], messageProjectIds: [], freeAddressBookId: '', requiredTasks: [] };
    const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {CourseOperationsEditor} from './src/components/course-operations/course-editor';import {WebinarDashboard} from './src/components/course-operations/webinar-dashboard';
      const courseId=location.pathname.split('/').pop();createRoot(document.getElementById('root')).render(location.pathname==='/work'?<WebinarDashboard/>:<CourseOperationsEditor courseId={courseId} initialDraft={${JSON.stringify(draft)}} initialTab="webinar"/>);`;
    const bundle = await esbuild.build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, jsx: 'automatic', bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"development"', 'process.env': '{}' }, plugins: [{ name: 'next-adapter', setup(build) {
      build.onResolve({ filter: /^next\/(link|navigation|image)$/ }, args => ({ path: args.path, namespace: 'next-adapter' }));
      build.onLoad({ filter: /.*/, namespace: 'next-adapter' }, args => ({ contents: args.path === 'next/link' ? "import React from 'react';export default function Link({href,children,prefetch,replace,...props}){return <a href={href} {...props}>{children}</a>}" : args.path === 'next/image' ? "import React from 'react';export default function Image({fill,unoptimized,priority,...props}){return <img {...props}/>}" : "export const useRouter=()=>({push:p=>location.assign(p),refresh:()=>location.reload()});export const usePathname=()=>location.pathname;", loader: 'jsx', resolveDir: process.cwd() }));
    }}] });
    const css = await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
    server = http.createServer(async (req, res) => {
      const identity = req.headers['x-test-auth'] === 'none' ? null : { id: req.headers['x-test-auth'] === 'outsider' ? outsider : owner };
      await sessions.run({ user: identity }, async () => {
        try {
          if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
          if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); return; }
          if (req.url.startsWith('/api/')) {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const request = new Request(`http://127.0.0.1:${server.address().port}${req.url}`, { method: req.method, headers: req.headers, ...(req.method === 'PUT' ? { body: Buffer.concat(chunks) } : {}) });
            const result = req.url === '/api/course-webinars' ? await apis.list.GET() : await apis.course[req.method](request, { params: Promise.resolve({ courseId: req.url.split('/')[3] }) });
            res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text()); return;
          }
          res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><main id="root" class="mx-auto max-w-[1600px] p-5"></main><script src="/bundle.js"></script></body></html>');
        } catch (error) { res.statusCode = 500; res.end(error.message); }
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); activePage = page;
    const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.stack); });
    await page.goto(`${origin}/services/course-operations/${first}?tab=webinar`);
    await page.getByRole('button', { name: '웨비나 정보 저장', exact: true }).waitFor();
    const inputs = { group_chat_count: '1000', communication_count: '400', live_start_count: '200', live_peak_count: '300', hours_to_peak: '1.5', live_end_count: '150', ad_spend: '1000000', payment_count: '20', revenue: '5000000' };
    for (const [key, value] of Object.entries(inputs)) await page.locator(`#webinar-${key}`).fill(value);
    await page.getByRole('tab', { name: '정보', exact: true }).click();
    await page.getByRole('tab', { name: '라이브 웨비나', exact: true }).click();
    assert.equal(await page.locator('#webinar-payment_count').inputValue(), '20', 'tab switching retains edits');
    await page.getByRole('button', { name: '웨비나 정보 저장', exact: true }).click();
    await page.getByText('라이브 웨비나 정보를 저장했습니다. WORK 대시보드에 반영됩니다.', { exact: true }).waitFor();
    await page.reload(); await page.waitForFunction(() => document.querySelector('#webinar-revenue')?.value === '5000000');
    for (const [key, value] of Object.entries(inputs)) assert.equal(await page.locator(`#webinar-${key}`).inputValue(), value);
    for (const value of ['20%', '10%', '2%', '500%']) await page.getByText(value, { exact: true }).waitFor();
    await page.screenshot({ path: path.join(temp, 'editor-desktop.png'), fullPage: true });
    const stalePage = await context.newPage(); await stalePage.goto(page.url()); await stalePage.locator('#webinar-payment_count').fill('22');
    await page.locator('#webinar-payment_count').fill('21'); await page.getByRole('button', { name: '웨비나 정보 저장', exact: true }).click(); await page.getByRole('status').waitFor();
    await stalePage.getByRole('button', { name: '웨비나 정보 저장', exact: true }).click(); await stalePage.getByRole('alert').waitFor();
    assert.equal(await stalePage.locator('#webinar-payment_count').inputValue(), '22'); await stalePage.close();
    const apiUrl = `${origin}/api/course-operations/${first}/webinar`;
    assert.equal((await page.request.get(apiUrl, { headers: { 'x-test-auth': 'none' } })).status(), 401);
    assert.equal((await page.request.get(apiUrl, { headers: { 'x-test-auth': 'outsider' } })).status(), 404);
    assert.equal((await page.request.put(apiUrl, { data: { metrics: { payment_count: -1 }, version: 2 } })).status(), 400);
    assert.equal((await page.request.put(apiUrl, { headers: { 'x-test-auth': 'outsider' }, data: { metrics: {}, version: 2 } })).status(), 404);
    assert.equal((await page.request.put(`${origin}/api/course-operations/${second}/webinar`, { data: { metrics: { group_chat_count: 100, live_start_count: 50, payment_count: 5, ad_spend: 100000, revenue: 200000 }, version: 0 } })).status(), 200);
    assert.equal((await (await page.request.get(`${origin}/api/course-webinars`)).json()).items.length, 501);
    await page.goto(`${origin}/work`); await page.getByText('조회 501개 강의 · 실적 입력 2개 · 집계는 현재 조회된 전체 강의 기준', { exact: true }).waitFor();
    await page.getByLabel('웨비나 개최 월').fill('2026-09');
    await page.getByText('조회 2개 강의 · 실적 입력 2개 · 집계는 현재 조회된 전체 강의 기준', { exact: true }).waitFor();
    await page.getByText('5,200,000원', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(temp, 'dashboard-desktop.png'), fullPage: true });
    await page.getByLabel('웨비나 강의·강사 검색').fill('강사 둘');
    assert.equal(await page.getByRole('row').count(), 2);
    await page.getByRole('link', { name: '두 번째 웨비나', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#webinar-payment_count')?.value === '5');
    assert.equal(await page.locator('#webinar-communication_count').inputValue(), '');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.screenshot({ path: path.join(temp, 'editor-mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'editor fits 360px');
    assert.ok(await page.locator('[data-slot="badge"]').first().evaluate(element => element.scrollHeight <= element.clientHeight), 'course ID wraps without clipping');
    await page.goto(`${origin}/work`); await page.getByRole('region', { name: '강의별 웨비나 실적 표' }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'dashboard fits 360px with scrolling table');
    await page.screenshot({ path: path.join(temp, 'dashboard-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    const result = { passed: true, checks: ['nine fields save/reload', 'actual editor tab and unsaved state', 'conversion and ROAS display', 'concurrent editor conflict', 'API auth and invalid inputs', 'per-course isolation', '501-course dashboard pagination', 'month and instructor filters', 'course deep link', '360px editor and dashboard'], screenshots: temp };
    await fs.writeFile(path.join(temp, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (activePage) { await activePage.screenshot({ path: path.join(temp, 'failure.png'), fullPage: true }); console.error((await activePage.locator('body').innerText()).slice(-3000)); }
    throw error;
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await db.close(); delete global.__webinarSessions; delete global.__webinarClient;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
