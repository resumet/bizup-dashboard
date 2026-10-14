/* eslint-disable @typescript-eslint/no-require-imports -- Isolated API and browser integration. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let browser, server;
  const cache = path.resolve('.cache/student-comparison');
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const course = { id: id(90), workspace_id: id(99), name: '미닝 강의', instructor_name: '미닝', cohort: '1', free_webinar_at: '2026-10-01T10:00:00Z' };
  const rosters = [1, 2, 3, 4, 5, 6].map(n => ({ id: id(n), workspace_id: id(99), latest_version: 3, is_order_roster: n !== 4, course: n === 5 ? null : { ...course, id: id(90 + n), cohort: String(n), workspace_id: n === 6 ? id(98) : id(99) } }));
  const enrollment = (job, n, version = 3) => ({ id: id(job * 10000 + n), job_id: id(job), version, source_row_number: n, normalized_phone: `010${String(n).padStart(8, '0')}`, normalized_values: { customerName: `학생${n}`, email: `student${n}@example.test` } });
  const rows = [...Array.from({ length: 1051 }, (_, n) => enrollment(1, n + 1)), ...Array.from({ length: 51 }, (_, n) => enrollment(2, n + 1)), enrollment(2, 1051, 2)];
  let authenticated = true, authorized = true, failRead = false, slow = false, optionsEmpty = false;
  global.__comparisonUser = () => authenticated ? { id: id(100) } : null;
  global.__comparisonMembership = () => { if (!authorized) throw new Error('denied'); return { workspace_id: id(99) }; };
  global.__comparisonAdmin = { from(table) {
    const filters = []; let from = 0, to = Infinity;
    const execute = () => {
      if (table === 'job_enrollments' && failRead) return { data: null, error: { code: 'fixture' } };
      const source = table === 'course_jobs' ? optionsEmpty ? [] : rosters : rows;
      return { data: source.filter(row => filters.every(([key, value]) => key.split('.').reduce((item, part) => item?.[part], row) === value)).slice(from, to + 1), error: null };
    };
    const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, returns() { return query; }, order() { return query; }, range(start, end) { from = start; to = end; return query; },
      async maybeSingle() { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; }, then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
    }; return query;
  } };
  try {
    await fs.mkdir(cache, { recursive: true });
    const api = await build({ entryPoints: ['src/app/api/course-operations/student-comparison/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'services', setup(b) {
      b.onResolve({ filter: /^(server-only|@\/lib\/supabase\/(server|admin|auth)|@\/lib\/course-operations\/server)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'server-only' ? '' : args.path.endsWith('admin') ? 'export const createAdminClient=()=>global.__comparisonAdmin' : args.path.endsWith('auth') ? 'export const getAuthenticatedUser=async()=>global.__comparisonUser()' : args.path.includes('course-operations') ? 'export const requireCourseOperationsMembership=async()=>global.__comparisonMembership()' : 'export const createClient=async()=>({})' }));
    } }] });
    const apiPath = path.join(cache, 'route.cjs'); await fs.writeFile(apiPath, api.outputFiles[0].text);
    const { GET, POST } = require(apiPath);
    const compare = (leftId = id(1), rightId = id(2)) => POST(new Request('http://fixture/api', { method: 'POST', body: JSON.stringify({ leftId, rightId }) }));
    assert.deepEqual((await (await GET()).json()).rosters.map(row => row.id), [id(1), id(2), id(3)]);
    authenticated = false; assert.equal((await GET()).status, 401); assert.equal((await compare()).status, 401); authenticated = true;
    authorized = false; assert.equal((await GET()).status, 403); assert.equal((await compare()).status, 403); authorized = true;
    assert.equal((await compare(id(1), id(1))).status, 400); assert.equal((await compare('bad', id(2))).status, 400);
    for (const invalid of [4, 5, 6, 7]) assert.equal((await compare(id(1), id(invalid))).status, 404);
    const response = await compare(); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const result = await response.json(); assert.equal(result.matches.length, 51); assert.equal(result.left.rowCount, 1051); assert.equal(result.right.rowCount, 51);
    assert.equal((await (await compare(id(1), id(3))).json()).matches.length, 0);
    failRead = true; assert.equal((await compare()).status, 500); failRead = false;
    const before = structuredClone(rows);
    const ui = await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import{StudentComparisonDialog}from'./src/components/course-operations/student-comparison-dialog';createRoot(document.getElementById('root')).render(<StudentComparisonDialog/>);", loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env': '{}' } });
    const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css;
    server = http.createServer(async (req, res) => {
      if (req.url.startsWith('/api/')) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        if (slow && req.method === 'POST') await new Promise(resolve => setTimeout(resolve, 500));
        const response = req.method === 'GET' ? await GET() : await POST(new Request('http://fixture/api', { method: 'POST', body: Buffer.concat(chunks) }));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return;
      }
      res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html; charset=utf-8');
      res.end(req.url === '/bundle.js' ? ui.outputFiles[0].text : req.url === '/style.css' ? css : '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const open = () => page.getByRole('button', { name: '수강생 비교', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '수강생 비교' });
    const choose = async () => { await dialog.getByLabel('명단 1', { exact: true }).selectOption(id(1)); await dialog.getByLabel('명단 2', { exact: true }).selectOption(id(2)); };
    await open(); await choose(); assert.equal(await dialog.locator(`#compare-right option[value="${id(1)}"]`).isDisabled(), true);
    await dialog.getByRole('button', { name: '비교하기', exact: true }).click();
    await dialog.getByRole('status').filter({ hasText: '중복 수강생 51명' }).waitFor();
    assert.equal(await dialog.locator('tbody tr').count(), 50);
    await dialog.screenshot({ path: path.join(cache, 'comparison-desktop.png') });
    await dialog.getByRole('button', { name: '다음', exact: true }).click(); assert.equal(await dialog.locator('tbody tr').count(), 1);
    await dialog.getByLabel('명단 2', { exact: true }).selectOption(id(3)); assert.equal(await dialog.locator('tbody').count(), 0);
    await dialog.getByRole('button', { name: '비교하기', exact: true }).click(); await dialog.getByText('두 명단에 공통으로 포함된 수강생이 없습니다.').waitFor();
    await page.setViewportSize({ width: 390, height: 844 }); await choose();
    failRead = true; await dialog.getByRole('button', { name: '비교하기', exact: true }).click(); await dialog.getByRole('alert').waitFor(); failRead = false;
    await dialog.getByRole('button', { name: '비교하기', exact: true }).click(); await dialog.getByRole('status').filter({ hasText: '중복 수강생 51명' }).waitFor();
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await dialog.screenshot({ path: path.join(cache, 'comparison-mobile.png') });
    slow = true; await dialog.getByRole('button', { name: '비교하기', exact: true }).click(); await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await open(); await dialog.getByLabel('명단 1', { exact: true }).waitFor(); await page.waitForTimeout(700);
    assert.equal(await dialog.locator('tbody').count(), 0); assert.equal(await dialog.getByLabel('명단 1', { exact: true }).inputValue(), ''); slow = false;
    await dialog.getByRole('button', { name: '닫기', exact: true }).click(); optionsEmpty = true; await open();
    await dialog.getByRole('status').filter({ hasText: '두 개 이상 필요합니다' }).waitFor(); assert.equal(await dialog.getByRole('button', { name: '비교하기', exact: true }).isDisabled(), true);
    assert.deepEqual(rows, before); assert.deepEqual(errors, []);
    console.log('PASS: API authorization/invalid selections/latest version/1000+ rows/no writes; browser selection/results/pagination/empty/error/retry/stale close/desktop/mobile');
  } finally { await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); }
})().catch(error => { console.error(error); process.exitCode = 1; });
