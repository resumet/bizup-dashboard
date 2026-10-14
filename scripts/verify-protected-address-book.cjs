/* eslint-disable @typescript-eslint/no-require-imports -- Isolated API and browser verification. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let browser, server;
  const cache = path.resolve('.cache/protected-address-book');
  const protectedBook = { id: 'fixed', name: '전체 명단', workspace_id: 'workspace', contact_count: 27444, updated_at: '2026-01-01' };
  const ordinaryBook = { ...protectedBook, id: 'ordinary', name: '일반 명단', updated_at: '2026-10-14' };
  let writes = 0, authenticated = true;
  const client = { from(table) {
    let id;
    const query = { select() { return query; }, eq(key, value) { if (key === 'id') id = value; return query; }, limit() { return query; },
      async maybeSingle() { return { data: table === 'workspace_members' ? { role: 'admin' } : id === 'fixed' ? protectedBook : id === 'ordinary' ? ordinaryBook : null, error: null }; },
      update() { writes++; return query; }, delete() { writes++; return query; }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
    }; return query;
  } };
  global.__protectedClient = client;
  global.__protectedUser = () => authenticated ? { id: 'admin', email: 'admin@example.test' } : null;
  try {
    await fs.mkdir(cache, { recursive: true });
    const api = await build({ entryPoints: ['src/app/api/address-books/[bookId]/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'services', setup(b) {
      b.onResolve({ filter: /^@\/lib\/supabase\/(server|admin|auth)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path.endsWith('auth') ? 'export const getAuthenticatedUser=async()=>global.__protectedUser()' : args.path.endsWith('admin') ? 'export const createAdminClient=()=>global.__protectedClient' : 'export const createClient=async()=>global.__protectedClient' }));
    } }] });
    const apiPath = path.join(cache, 'route.cjs'); await fs.writeFile(apiPath, api.outputFiles[0].text);
    const handlers = require(apiPath);
    const request = (method, bookId, name = '변경') => handlers[method](new Request('http://fixture/api', { method, ...(method === 'PATCH' ? { body: JSON.stringify({ name }) } : {}) }), { params: Promise.resolve({ bookId }) });
    assert.equal((await request('PATCH', 'fixed')).status, 403);
    assert.equal((await request('DELETE', 'fixed')).status, 403);
    assert.equal((await request('PATCH', 'ordinary', '전체 명단')).status, 403);
    assert.equal((await request('PATCH', 'missing')).status, 404);
    assert.equal(writes, 0);
    authenticated = false; assert.equal((await request('PATCH', 'fixed')).status, 401); assert.equal((await request('DELETE', 'fixed')).status, 401); authenticated = true;
    assert.equal((await request('PATCH', 'ordinary')).status, 200); assert.equal(writes, 1);
    const ui = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{AddressBookManager}from'./src/components/address-books/address-book-manager';import{AddressBookDetail}from'./src/components/address-books/address-book-detail';const fixed=${JSON.stringify(protectedBook)},ordinary=${JSON.stringify(ordinaryBook)};createRoot(document.getElementById('root')).render(location.pathname==='/'?<AddressBookManager initialBooks={[ordinary,fixed]} canDelete={true}/>:<AddressBookDetail mode="manager" book={location.pathname==='/fixed'?fixed:ordinary} contacts={[]} totalContacts={0} currentPage={1} contactsPerPage={100} initialKeyword="" initialSort="nameAsc" templates={[]} history={[]}/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env': '{}' }, plugins: [{ name: 'router', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents: args.path.endsWith('link') ? 'import React from "react";export default function Link(p){return React.createElement("a",p)}' : 'const router={refresh(){},push(){}};export const useRouter=()=>router;' }));
    } }] });
    const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css;
    server = http.createServer((req, res) => {
      res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html; charset=utf-8');
      res.end(req.url === '/bundle.js' ? ui.outputFiles[0].text : req.url === '/style.css' ? css : '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin); await page.getByRole('link', { name: '전체 명단', exact: true }).waitFor();
    const first = page.locator('tbody tr').first(); assert.match(await first.textContent(), /전체 명단/);
    assert.equal(await first.getByRole('button', { name: '삭제' }).count(), 0);
    assert.equal(await page.locator('tbody tr').nth(1).getByRole('button', { name: '삭제' }).isEnabled(), true);
    await page.screenshot({ path: path.join(cache, 'pinned.png') });
    await page.goto(`${origin}/fixed`); await page.getByRole('heading', { name: '전체 명단', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '이름 수정' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Excel 추가' }).isEnabled(), true);
    await page.goto(`${origin}/ordinary`); await page.getByRole('button', { name: '이름 수정' }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: pinned first despite old timestamp; admin cannot delete/rename in UI or API; normal rename/import retained; no unauthorized writes');
  } finally { await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); }
})().catch(error => { console.error(error); process.exitCode = 1; });
