/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser integration test. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { AsyncLocalStorage } = require('node:async_hooks');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');
const sessions = new AsyncLocalStorage();

(async () => {
  let db, server, browser;
  await fs.mkdir('.cache/workspace-personnel', { recursive: true });
  try {
    await esbuild.build({ entryPoints: ['src/lib/personnel/fixture.ts'], outfile: '.cache/workspace-personnel/fixture.cjs', bundle: true, packages: 'external', platform: 'node', format: 'cjs' });
    const { createPersonnelFixture, personnelFixtureIds: ids } = require(path.resolve('.cache/workspace-personnel/fixture.cjs'));
    db = await createPersonnelFixture();
    const today = (await db.query("select (now() at time zone 'Asia/Seoul')::date::text as today")).rows[0].today;
    delete process.env.HR_PERSONNEL_ENCRYPTION_KEY;
    const identity = () => sessions.getStore() === 'staff' ? { id: ids.staff, email: 'staff@example.test' } : { id: ids.root, email: 'resumet@gmail.com' };
    let queue = Promise.resolve();
    async function execute(sql, args) {
      const operation = queue.then(async () => {
        try {
          const rows = await db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(sql, args)).rows; });
          return { rows, error: null };
        } catch (error) { return { rows: [], error: { code: error.code, message: error.message } }; }
      });
      queue = operation.then(() => undefined);
      return operation;
    }
    global.__personnelAuth = { auth: { getClaims: async () => ({ data: { claims: { sub: identity().id, email: identity().email } }, error: null }) } };
    global.__personnelMembership = async () => ({ workspace_id: ids.workspace, role: identity().id === ids.root ? 'super_admin' : 'user' });
    global.__personnelAdmin = {
      async rpc(name, args) {
        const queries = {
          personnel_access: ['select public.personnel_access($1,$2) data', [args.p_workspace_id, args.p_user_id]],
          personnel_query: ['select public.personnel_query($1,$2,$3,$4,$5,$6) data', [args.p_workspace_id, args.p_actor_id, args.p_id ?? null, args.p_page ?? 0, args.p_q ?? '', args.p_status ?? 'all']],
          personnel_save: ['select public.personnel_save($1,$2,$3::jsonb) data', [args.p_workspace_id, args.p_actor_id, JSON.stringify(args.p)]],
          personnel_reveal: ['select public.personnel_reveal($1,$2,$3) data', [args.p_workspace_id, args.p_actor_id, args.p_id]],
        };
        assert.ok(queries[name], `Unexpected RPC ${name}`);
        const result = await execute(...queries[name]); return { data: result.rows[0]?.data, error: result.error };
      },
      from(table) {
        assert.ok(['hr_annual_leave_grants', 'hr_leave_requests', 'hr_leave_support_records'].includes(table));
        const values = [], conditions = []; let columns = '*', single = false;
        const builder = { select(value) { assert.match(value, /^[a-z_,]+$/); columns = value; return builder; }, maybeSingle() { single = true; return builder; },
          then(resolve, reject) { return execute(`select ${columns} from public.${table}${conditions.length ? ' where ' + conditions.join(' and ') : ''}`, values).then(result => ({ data: single ? result.rows[0] ?? null : result.rows, error: result.error })).then(resolve, reject); } };
        for (const [name, operator] of [['eq', '='], ['gte', '>='], ['lte', '<='], ['gt', '>']]) builder[name] = (column, value) => { assert.match(column, /^[a-z_]+$/); values.push(value); conditions.push(`${column}${operator}$${values.length}`); return builder; };
        return builder;
      },
    };
    await esbuild.build({ entryPoints: ['src/app/api/hr/personnel/route.ts'], outfile: '.cache/workspace-personnel/api.cjs', bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'isolated-transports', setup(build) {
      build.onResolve({ filter: /^server-only$|^@\/lib\/supabase\/(server|admin)$|^@\/lib\/course-operations\/server$/ }, args => ({ path: args.path, namespace: 'test-transport' }));
      build.onLoad({ filter: /.*/, namespace: 'test-transport' }, args => ({ contents: args.path === 'server-only' ? '' : args.path.endsWith('course-operations/server') ? 'export const requireCourseOperationsMembership=(id)=>global.__personnelMembership(id);' : args.path.endsWith('/admin') ? 'export const createAdminClient=()=>global.__personnelAdmin;' : 'export const createClient=async()=>global.__personnelAuth;', loader: 'js' }));
    } }] });
    const api = require(path.resolve('.cache/workspace-personnel/api.cjs'));
    const balanceYear = Number(today.slice(0, 4)) + 1;
    await db.query("insert into public.hr_annual_leave_grants(workspace_id,user_id,grant_year,granted_days,employment_start_date,granted_by) values($1,$2,$3,12,'2020-01-01',$4)", [ids.workspace, ids.staff, balanceYear, ids.root]);
    await db.query("insert into public.hr_leave_requests(workspace_id,user_id,leave_date,unit,status) values($1,$2,$3,'full','approved'),($1,$2,$4,'am','pending')", [ids.workspace, ids.staff, `${balanceYear}-01-02`, `${balanceYear}-01-03`]);
    await db.query("insert into public.hr_leave_support_records(workspace_id,user_id,support_date,support_type,unit,status) values($1,$2,$3,'night_webinar','half','approved')", [ids.workspace, ids.staff, `${balanceYear}-01-01`]);
    const staffId = (await db.query('select id from personnel_private.employees where user_id=$1', [ids.staff])).rows[0].id;
    const balanceResponse = await api.GET(new Request(`http://localhost/api/hr/personnel?id=${staffId}&year=${balanceYear}`));
    assert.equal(balanceResponse.status, 200);
    assert.deepEqual((await balanceResponse.json()).leave, { year: balanceYear, baseGranted: 12, extraGranted: 0.5, used: 1, pending: 0.5, remaining: 11.5, availableToRequest: 11, upcoming: 1 });
    const bundle = await esbuild.build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {PersonnelManager} from './src/components/hr/personnel-manager'; createRoot(document.getElementById('root')).render(<PersonnelManager today='${today}'/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', jsx: 'automatic' });
    const css = await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
    server = http.createServer(async (req, res) => sessions.run(req.headers.cookie?.includes('staff=1') ? 'staff' : 'root', async () => {
      try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
        if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); return; }
        if (req.url.startsWith('/api/')) {
          const chunks = []; for await (const chunk of req) chunks.push(chunk);
          const result = await api[req.method](new Request(origin + req.url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) }));
          res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text()); return;
        }
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
      } catch (error) { res.statusCode = 500; res.end(error.message); }
    }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole('button', { name: '신규채용', exact: true }).click();
    await page.getByLabel('이름', { exact: true }).fill('검증 직원');
    await page.getByLabel('이메일', { exact: true }).fill('new@example.test');
    await page.getByLabel('입사일', { exact: true }).fill('2020-01-01');
    await page.getByLabel('주소', { exact: true }).fill('검증 주소');
    await page.getByLabel('연봉 (원)').fill('50000000');
    await page.getByLabel('급여 지급 은행').fill('검증은행');
    await page.getByLabel('급여 계좌번호').fill('001-002-0003');
    await page.getByLabel('주민등록번호').fill('000101-3000000');
    await page.getByLabel('처리 사유').fill('신규채용 테스트');
    await page.getByRole('button', { name: '신규채용 저장' }).click();
    await page.getByText('임직원 정보를 저장했습니다.').waitFor();
    await page.getByRole('button', { name: '검증 직원', exact: true }).click();
    await page.getByLabel('주소', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('주소', { exact: true }).inputValue(), '검증 주소');
    assert.equal(await page.getByLabel('주민등록번호').inputValue(), '');
    assert.equal(await page.getByLabel('급여 지급 은행').inputValue(), '검증은행');
    assert.equal(await page.getByLabel('급여 계좌번호').inputValue(), '001-002-0003');
    assert.equal((await db.query("select resident_number from personnel_private.employees where email='new@example.test'")).rows[0].resident_number, '0001013000000');
    await page.getByRole('button', { name: '주민번호 보기' }).click();
    await page.waitForFunction(() => document.getElementById('personnel-resident').value === '0001013000000');
    await page.getByRole('button', { name: '주민번호 숨기기' }).click();
    await page.locator('[role="dialog"] > div.overflow-y-auto').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: '.cache/workspace-personnel/desktop.png', fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.cache/workspace-personnel/mobile.png', fullPage: true, animations: 'disabled' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByLabel('인사 처리').selectOption('resign');
    await page.getByLabel('퇴직일').fill('2021-01-01');
    await page.getByLabel('처리 사유').fill('퇴사 검증');
    await page.getByRole('button', { name: '퇴사 저장' }).click();
    await page.getByText('임직원 정보를 저장했습니다.').waitFor();
    await page.getByLabel('재직 상태').selectOption('resigned');
    await page.getByRole('button', { name: '검증 직원', exact: true }).click();
    await page.getByText('퇴사 검증', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('연봉 (원)').inputValue(), '50000000');
    await page.getByLabel('인사 처리').selectOption('rehire');
    await page.getByLabel('재입사일').fill('2022-01-01');
    await page.getByLabel('처리 사유').fill('재입사 검증');
    await page.getByRole('button', { name: '재입사 저장' }).click();
    await page.getByText('임직원 정보를 저장했습니다.').waitFor();
    await page.getByLabel('재직 상태').selectOption('employed');
    await page.getByRole('button', { name: '검증 직원', exact: true }).click();
    await page.getByText('2020-01-01 ~ 2021-01-01').waitFor();
    await page.getByText('2022-01-01 ~ 재직 중').waitFor();
    const staffContext = await browser.newContext();
    await staffContext.addCookies([{ name: 'staff', value: '1', url: origin }]);
    assert.equal((await staffContext.request.get(origin + '/api/hr/personnel')).status(), 403);
    assert.equal((await staffContext.request.post(origin + '/api/hr/personnel', { headers: { Origin: origin }, data: {} })).status(), 403);
    assert.equal((await page.request.post(origin + '/api/hr/personnel', { headers: { Origin: 'https://outside.example' }, data: {} })).status(), 403);
    assert.deepEqual(errors, []);
    console.log('PASS: actual UI, API, permissions and PostgreSQL; plaintext resident number without key, bank account leading zeros, reveal, resignation, rehire, history retention, desktop/mobile. Auth and Supabase transport are isolated test adapters.');
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await db?.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
