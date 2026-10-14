/* eslint-disable @typescript-eslint/no-require-imports -- Isolated API/storage and browser integration harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const writeXlsx = require('write-excel-file/node').default;
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let browser, server;
  const originalFetch = global.fetch;
  const dashboardId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const workspaceId = '33333333-3333-4333-8333-333333333333';
  const cache = path.resolve('.cache/ad-performance-update');
  let savedCount = 0, uploadCount = 0, removeCount = 0, failSave = false;
  let authenticated = true, authorized = true;
  const storage = new Map();
  const sourceRows = [['일자', '총광고비'], ['', ''], ...['2026-10-01', '2026-10-02'].map(date => [date, '300', '100', '200', '10', '20', '', '', '', '', '100', '200', '5', '10', '7', '8'])];
  let state = { spreadsheet_url: 'https://docs.google.com/spreadsheets/d/abcdefghijklmn/edit', spreadsheet_id: 'abcdefghijklmn', sheet_name: '강의', source_rows: sourceRows, tracking_file_name: null, tracking_data: null, manual_inputs: { '2026-10-01': { bizupDbCumulative: 99, chatMembersCumulative: 10 } }, version: 1, updated_at: '' };
  let googleRows = structuredClone(sourceRows);
  const sheet = () => ({ spreadsheetUrl: state.spreadsheet_url, spreadsheetId: state.spreadsheet_id, sheetName: state.sheet_name, sourceRows: state.source_rows, trackingFileName: state.tracking_file_name, tracking: state.tracking_data, manualInputs: state.manual_inputs, version: state.version, updatedAt: state.updated_at });
  global.__adUpdateUser = () => { if (!authenticated) throw new Error('UNAUTHORIZED'); return { id: userId }; };
  global.__adUpdateMembership = () => ({ workspace_id: workspaceId });
  global.__adUpdateAdmin = {
    from(table) {
      const query = { select() { return query; }, eq() { return query; }, async maybeSingle() {
        return { data: table === 'ad_performance_dashboards' ? authorized ? { id: dashboardId, workspace_id: workspaceId, start_date: '2026-10-01' } : null : structuredClone(state), error: null };
      } }; return query;
    },
    async rpc(name, args) {
      assert.equal(name, 'save_ad_performance_sheet_state');
      if (failSave || args.p_expected_version !== state.version) return { data: null, error: { message: '저장 충돌 검증' } };
      savedCount++;
      state = { spreadsheet_url: args.p_spreadsheet_url, spreadsheet_id: args.p_spreadsheet_id, sheet_name: args.p_sheet_name, source_rows: args.p_source_rows, tracking_file_name: args.p_tracking_file_name, tracking_data: args.p_tracking_data, manual_inputs: args.p_manual_inputs, version: state.version + 1, updated_at: String(savedCount) };
      return { data: state.version, error: null };
    },
    storage: { from() { return {
      async upload(key, data) { uploadCount++; storage.set(key, data); return { error: null }; },
      async remove(keys) { removeCount++; keys.forEach(key => storage.delete(key)); return { error: null }; },
      async download(key) { return { data: storage.has(key) ? new Blob([storage.get(key)]) : null, error: storage.has(key) ? null : new Error('missing') }; },
    }; } },
  };
  const csv = '신청일,유입경로,진행매체\n2026-10-01,그로스임팩트,구글\n2026-10-01,그로스임팩트,메타\n2026-10-02,채널A,유튜브\n';
  const csvFile = new File([csv], '전체신청.csv', { type: 'text/csv' });
  const context = { params: Promise.resolve({ dashboardId }) };
  try {
    await fs.mkdir(cache, { recursive: true });
    const handlers = {};
    for (const endpoint of ['tracking-import', 'source-sheet']) {
      const bundle = await build({ entryPoints: [`src/app/api/ad-performance/[dashboardId]/${endpoint}/route.ts`], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'isolated-services', setup(b) {
        b.onResolve({ filter: /^(server-only|@\/lib\/supabase\/(server|admin)|@\/lib\/course-operations\/server)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'server-only' ? '' : args.path.endsWith('/admin') ? 'export const createAdminClient=()=>global.__adUpdateAdmin' : args.path.includes('course-operations') ? 'export const requireCourseOperationsUser=async()=>global.__adUpdateUser();export const requireCourseOperationsMembership=async()=>global.__adUpdateMembership()' : 'export const createClient=async()=>({})' }));
      } }] });
      const out = path.join(cache, `${endpoint}.cjs`); await fs.writeFile(out, bundle.outputFiles[0].text); handlers[endpoint] = require(out);
    }
    global.fetch = async (url, options) => String(url).startsWith('https://docs.google.com/') ? new Response(await writeXlsx(googleRows, { sheet: '강의' }).toBuffer()) : originalFetch(url, options);
    async function upload(file, preview) {
      const form = new FormData(); form.set('file', file); form.set('action', preview ? 'confirm' : 'preview');
      if (preview) { form.set('version', String(preview.version)); form.set('fingerprint', preview.fingerprint); }
      return handlers['tracking-import'].POST(new Request('http://fixture/upload', { method: 'POST', body: form }), context);
    }
    const initial = structuredClone(state);
    const preview = (await (await upload(csvFile)).json()).preview;
    assert.ok(preview.changes.some(change => change.date === '2026-10-01' && change.field === '랜딩접수 DB · 구글' && change.before === 7 && change.after === 1));
    assert.deepEqual(state, initial); assert.equal(uploadCount, 0); assert.equal(savedCount, 0);
    assert.equal((await upload(new File([csv + '2026-10-01,그로스임팩트,구글\n'], csvFile.name), preview)).status, 409);
    state.version++;
    assert.equal((await upload(csvFile, preview)).status, 409); assert.equal(uploadCount, 0);
    const currentPreview = (await (await upload(csvFile)).json()).preview;
    failSave = true;
    assert.equal((await upload(csvFile, currentPreview)).status, 400);
    assert.equal(storage.size, 0); assert.equal(removeCount, 1); failSave = false;
    authenticated = false; assert.equal((await upload(csvFile)).status, 401); authenticated = true;
    authorized = false; assert.equal((await upload(csvFile)).status, 404); authorized = true;
    assert.equal(savedCount, 0);

    const browserBundle = await build({ stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {MeaningSheetWorkspace} from './src/components/admin/meaning-sheet-workspace';function App(){const [toolbar,setToolbar]=useState(null);return <><div ref={setToolbar}/><MeaningSheetWorkspace dashboardId="${dashboardId}" dashboardStartDate="2026-10-01" sheetState={window.fixture} toolbarContainer={toolbar}/></>};createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env': '{}' }, plugins: [{ name: 'router', setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'const router={refresh(){}};export const useRouter=()=>router;' }));
    } }] });
    const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css;
    server = http.createServer(async (req, res) => {
      try {
        if (req.url.startsWith('/api/')) {
          const chunks = []; for await (const chunk of req) chunks.push(chunk);
          const url = `http://127.0.0.1:${server.address().port}${req.url}`;
          const endpoint = new URL(url).pathname.split('/').pop();
          const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
          const response = await handlers[endpoint][req.method](request, context);
          res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
        }
        res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html; charset=utf-8');
        res.end(req.url === '/bundle.js' ? browserBundle.outputFiles[0].text : req.url === '/style.css' ? css : `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script>window.fixture=${JSON.stringify(sheet())}</script><script src="/bundle.js"></script>`);
      } catch (error) { res.statusCode = 500; res.end(String(error)); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);
    async function openUpload() {
      await page.getByRole('button', { name: '유입엑셀추가', exact: true }).click();
      await page.getByLabel('엑셀 또는 CSV 파일', { exact: true }).setInputFiles({ name: csvFile.name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await page.getByRole('button', { name: '변경 내역 확인', exact: true }).click();
      await page.getByRole('dialog', { name: '광고성과 변경 내역 확인' }).waitFor();
    }
    await openUpload();
    const dialog = page.getByRole('dialog', { name: '광고성과 변경 내역 확인' });
    assert.ok((await dialog.locator('tbody').textContent()).includes('2026-10-01'));
    assert.equal(savedCount, 0);
    await dialog.getByRole('button', { name: '취소', exact: true }).click();
    assert.equal(savedCount, 0);
    await openUpload();
    await dialog.screenshot({ path: path.join(cache, 'review-desktop.png') });
    await dialog.getByRole('button', { name: '확인 후 업데이트', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(savedCount, 1);
    assert.equal(state.tracking_data.dailyByDate['10-01'].googleLandingDb, 1);
    assert.equal(state.manual_inputs['2026-10-01'].bizupDbCumulative, 2);
    assert.equal(state.manual_inputs['2026-10-01'].chatMembersCumulative, 10);
    assert.equal(storage.size, 1);
    await page.reload();
    googleRows[2][1] = '500';
    await page.getByRole('button', { name: '데이터 갱신', exact: true }).click();
    await dialog.waitFor(); assert.equal(savedCount, 1);
    googleRows[2][1] = '700';
    await dialog.getByRole('button', { name: '확인 후 업데이트', exact: true }).click();
    await dialog.getByRole('alert').waitFor(); assert.equal(savedCount, 1);
    assert.ok((await dialog.locator('tbody').textContent()).includes('700원'));
    await page.setViewportSize({ width: 390, height: 844 });
    await dialog.screenshot({ path: path.join(cache, 'review-mobile.png') });
    assert.equal(await dialog.getByRole('button', { name: '확인 후 업데이트', exact: true }).isVisible(), true);
    await dialog.getByRole('button', { name: '확인 후 업데이트', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' }); assert.equal(savedCount, 2);
    assert.equal(state.source_rows[2][1], '700');
    assert.equal(state.manual_inputs['2026-10-01'].chatMembersCumulative, 10);
    await page.reload();
    await page.getByRole('button', { name: '데이터 갱신', exact: true }).click();
    await dialog.waitFor(); await dialog.getByText('변경되는 지표가 없습니다.', { exact: false }).waitFor();
    await dialog.getByRole('button', { name: '취소', exact: true }).click(); assert.equal(savedCount, 2);
    googleRows.push(...Array.from({ length: 25 }, (_, index) => [`2026-09-${String(index + 1).padStart(2, '0')}`, '100', '200', '300']));
    await page.getByRole('button', { name: '데이터 갱신', exact: true }).click();
    await dialog.waitFor();
    const pagination = dialog.getByRole('navigation', { name: '변경 내역 페이지' });
    await pagination.waitFor();
    assert.equal(await dialog.locator('tbody tr').count(), 50);
    await pagination.getByRole('button', { name: '다음', exact: true }).click();
    assert.equal(await pagination.getByRole('button', { name: '이전', exact: true }).isEnabled(), true);
    await dialog.getByRole('button', { name: '취소', exact: true }).click(); assert.equal(savedCount, 2);
    assert.deepEqual(errors, []);
    console.log('PASS: real routes/parser/storage adapter + browser: preview/cancel no save, historical data, stale file/version/source rejection, explicit reconfirmation, failed-save cleanup, auth, no-change, desktop/mobile');
  } finally {
    global.fetch = originalFetch;
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    delete global.__adUpdateAdmin; delete global.__adUpdateUser; delete global.__adUpdateMembership;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
