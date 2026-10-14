/* eslint-disable @typescript-eslint/no-require-imports -- Isolated integration harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let browser, server;
  const cache = path.resolve('.cache/address-book-merge');
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const workspace = uuid(90), otherWorkspace = uuid(91);
  const contact = phone => ({ normalized_phone: phone, name: '신청자', email: null });
  const books = ['미닝-무료강의-신청자모음', '신청자 2', '신청자 3', '미닝 유료강의 주소록', '외부 주소록'].map((name, index) => ({ id: uuid(index + 1), name, workspace_id: index === 4 ? otherWorkspace : workspace, contact_count: 2, updated_at: '2026-10-14' }));
  const contacts = new Map([
    [uuid(1), [contact('01011112222'), contact('01033334444')]],
    [uuid(2), [contact('010-1111-2222'), contact('01055556666')]],
    [uuid(3), [contact('01077778888'), contact('01099990000')]],
    [uuid(4), [contact('+82 10 1111 2222'), contact('01055556666')]],
  ]);
  const course = { id: uuid(50), name: '미닝 강의', instructor_name: '미닝', cohort: '3', free_webinar_at: '2026-10-01T10:00:00Z', workspace_id: workspace };
  const roster = { name: '이전 강의명', is_order_roster: true, workspace_id: workspace, latest_version: 2, course };
  const rosters = [
    { ...roster, id: uuid(10) },
    { ...roster, id: uuid(11), workspace_id: otherWorkspace },
    { ...roster, id: uuid(12), is_order_roster: false },
    { ...roster, id: uuid(13), course: null },
    { ...roster, id: uuid(14), course: { ...course, workspace_id: otherWorkspace } },
    { ...roster, id: uuid(15), course: { ...course, id: uuid(51), cohort: '4' } },
  ];
  const enrollments = [
    { id: uuid(20), job_id: uuid(10), version: 2, normalized_phone: '01000000000', normalized_values: { customerName: '결제자', hasDifferentStudent: true, studentName: '실수강생', studentPhone: '01011112222' } },
    { id: uuid(21), job_id: uuid(10), version: 2, normalized_phone: '01033334444', normalized_values: { customerName: '환불자', refundedAt: '2026-10-01' } },
    { id: uuid(22), job_id: uuid(10), version: 1, normalized_phone: '01033334444', normalized_values: { customerName: '이전버전' } },
    { id: uuid(23), job_id: uuid(15), version: 2, normalized_phone: '+82 10 1111 2222', normalized_values: { customerName: '수강생1' } },
    { id: uuid(24), job_id: uuid(15), version: 2, normalized_phone: '01055556666', normalized_values: { customerName: '수강생2' } },
  ];
  let authenticated = true, authorized = true, failInsert = false;
  const created = [], saved = [], audit = [], deleted = [];
  global.__mergeUser = () => authenticated ? { id: uuid(99) } : null;
  global.__mergeMembership = () => { if (!authorized) throw new Error('denied'); return { workspace_id: workspace }; };
  global.__mergeAdmin = { from(table) {
    const filters = [], sets = [];
    let insert, deleting = false, start = 0, end = Infinity;
    const execute = () => {
      if (deleting) { deleted.push(filters); return { data: null, error: null }; }
      if (insert) {
        if (table === 'address_books') { const book = { ...insert, id: uuid(100 + created.length) }; created.push(book); return { data: book, error: null }; }
        if (table === 'address_book_contacts') { if (failInsert) return { error: { code: 'fixture' } }; saved.push(...insert); }
        if (table === 'audit_logs') audit.push(insert);
        return { error: null };
      }
      let rows = table === 'address_books' ? books : table === 'course_jobs' ? rosters : table === 'job_enrollments' ? enrollments :
        [...contacts].flatMap(([id, items]) => items.map((item, index) => ({ ...item, id: uuid(2000 + index), address_book_id: id })));
      rows = rows.filter(row => filters.every(([key, value]) => key.split('.').reduce((item, part) => item?.[part], row) === value) && sets.every(([key, values]) => values.includes(row[key])));
      return { data: rows.slice(start, end + 1), error: null };
    };
    const query = {
      select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
      returns() { return query; },
      in(key, values) { sets.push([key, values]); return query; }, order() { return query; },
      range(from, to) { start = from; end = to; return query; }, insert(value) { insert = value; return query; },
      delete() { deleting = true; return query; },
      async maybeSingle() { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; },
      async single() { return execute(); }, then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
    };
    return query;
  } };
  try {
    await fs.mkdir(cache, { recursive: true });
    const api = await build({ stdin: { contents: "export { POST } from './src/app/api/address-books/merge/route'; export { paidExclusionRostersQuery, paidExclusionRosterOption } from './src/lib/address-books/paid-rosters';", loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'services', setup(b) {
      b.onResolve({ filter: /^(server-only|@\/lib\/supabase\/(server|admin|auth)|@\/lib\/course-operations\/server)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'server-only' ? '' : args.path.endsWith('/admin') ? 'export const createAdminClient=()=>global.__mergeAdmin' : args.path.endsWith('/auth') ? 'export const getAuthenticatedUser=async()=>global.__mergeUser()' : args.path.includes('course-operations') ? 'export const requireCourseOperationsMembership=async()=>global.__mergeMembership()' : 'export const createClient=async()=>({})' }));
    } }] });
    const apiPath = path.join(cache, 'route.cjs'); await fs.writeFile(apiPath, api.outputFiles[0].text);
    const { POST, paidExclusionRostersQuery, paidExclusionRosterOption } = require(apiPath);
    const listed = await paidExclusionRostersQuery(global.__mergeAdmin, workspace).order('updated_at', { ascending: false });
    const options = listed.data.map(paidExclusionRosterOption);
    assert.deepEqual(options.map(option => option.id), [uuid(10), uuid(15)]);
    assert.match(options[0].name, /3기.*미닝 강의.*미닝/);
    assert.match(options[1].name, /4기/);
    const input = { name: '새 명단', mode: 'subtract', sourceBookIds: [uuid(1), uuid(2), uuid(3)], exclusion: { kind: 'roster', id: uuid(15) } };
    const request = body => POST(new Request('http://fixture/api/address-books/merge', { method: 'POST', body: JSON.stringify(body) }));
    for (const body of [null, { ...input, sourceBookIds: [] }, { ...input, sourceBookIds: [uuid(1), uuid(2), uuid(3), uuid(4)] }, { ...input, sourceBookIds: [uuid(1), uuid(1)] }, { ...input, exclusion: undefined }, { ...input, exclusion: { kind: 'address-book', id: uuid(1) } }, { ...input, mode: 'union' }]) assert.equal((await request(body)).status, 400);
    authenticated = false; assert.equal((await request(input)).status, 401); authenticated = true;
    authorized = false; assert.equal((await request(input)).status, 403); authorized = true;
    assert.equal((await request({ ...input, sourceBookIds: [uuid(5)] })).status, 404);
    assert.equal((await request({ ...input, exclusion: { kind: 'address-book', id: uuid(5) } })).status, 400);
    for (const id of [11, 12, 13, 14]) assert.equal((await request({ ...input, exclusion: { kind: 'roster', id: uuid(id) } })).status, 404);
    rosters[0].course = null;
    assert.equal((await request({ ...input, exclusion: { kind: 'roster', id: uuid(10) } })).status, 404);
    rosters[0].course = course;
    assert.equal(created.length, 0);
    failInsert = true; assert.equal((await request(input)).status, 500); failInsert = false;
    assert.equal(deleted.length, 1); assert.equal(saved.length, 0);
    const result = await (await request(input)).json();
    assert.equal(result.contactCount, 3); assert.equal(result.duplicateCount, 1); assert.equal(result.matchedExclusionCount, 2);
    assert.deepEqual(saved.map(row => row.normalized_phone), ['01033334444', '01077778888', '01099990000']);
    assert.equal(audit[0].metadata.matched_exclusion_count, 2);
    const original = structuredClone([...contacts]);
    const paginated = Array.from({ length: 1001 }, (_, n) => contact(`010${String(n).padStart(8, '0')}`));
    contacts.set(uuid(3), paginated);
    const large = await (await request({ ...input, sourceBookIds: [uuid(3)] })).json();
    assert.equal(large.contactCount, 1001);
    contacts.set(uuid(3), original.find(([id]) => id === uuid(3))[1]);

    const ui = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{AddressBookManager}from'./src/components/address-books/address-book-manager';createRoot(document.getElementById('root')).render(<AddressBookManager initialBooks={${JSON.stringify(books.slice(0, 4))}} exclusionRosters={location.search?[]:${JSON.stringify(options)}} canDelete={false}/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env': '{}' }, plugins: [{ name: 'router', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents: args.path.endsWith('link') ? 'import React from "react";export default function Link(p){return React.createElement("a",p)}' : 'const router={refresh(){},push(url){window.pushed=url}};export const useRouter=()=>router;' }));
    } }] });
    const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css;
    server = http.createServer(async (req, res) => {
      if (req.url === '/api/address-books/merge') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const response = await POST(new Request('http://fixture/api/address-books/merge', { method: 'POST', body: Buffer.concat(chunks) }));
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
    const open = () => page.getByRole('button', { name: '주소록 병합', exact: true }).click();
    const choose = index => page.getByRole('checkbox', { name: `${books[index].name} 선택`, exact: true }).check();
    const dialog = page.getByRole('dialog', { name: '새 주소록으로 병합' });
    const submit = () => dialog.getByRole('button', { name: '새 주소록 만들기' }).click();
    const done = page.getByRole('dialog', { name: '주소록 생성 완료' });
    await open(); await dialog.getByLabel('새 주소록 이름').fill('합친 주소록');
    await choose(0); assert.equal(await dialog.getByRole('button', { name: '새 주소록 만들기' }).isDisabled(), true);
    await choose(1); await choose(2);
    assert.equal(await page.getByRole('checkbox', { name: `${books[3].name} 선택`, exact: true }).isDisabled(), true);
    await submit(); await done.waitFor(); assert.match(await done.getByRole('status').textContent(), /생성 5명/);
    await done.getByRole('button', { name: '닫기', exact: true }).click();
    await open(); await dialog.getByRole('radio', { name: '유료 수강생 제외하기' }).check();
    await dialog.getByLabel('새 주소록 이름').fill('유료 수강생 제외'); await choose(0);
    assert.equal(await dialog.locator('#merge-exclusion option').count(), 3);
    assert.equal(await dialog.locator('option[value^="address-book:"]').count(), 0);
    assert.equal(await dialog.getByRole('button', { name: '새 주소록 만들기' }).isDisabled(), true);
    await dialog.getByLabel('제외할 유료 수강생 명단', { exact: true }).selectOption(`roster:${uuid(10)}`);
    await dialog.screenshot({ path: path.join(cache, 'subtract-desktop.png') });
    await submit(); await done.waitFor(); assert.match(await done.getByRole('status').textContent(), /생성 1명.*일치하여 제외 1명/);
    assert.equal(saved.at(-1).normalized_phone, '01033334444'); // Refunded/latest-version filtering, linked learner match.
    await done.getByRole('button', { name: '닫기', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await open(); await dialog.getByRole('radio', { name: '유료 수강생 제외하기' }).check();
    await dialog.getByLabel('새 주소록 이름').fill('세 명단에서 유료 제외'); await choose(0); await choose(1); await choose(2);
    await dialog.getByLabel('제외할 유료 수강생 명단', { exact: true }).selectOption(`roster:${uuid(15)}`);
    assert.equal(await dialog.locator(`option[value="address-book:${uuid(1)}"]`).count(), 0);
    await dialog.screenshot({ path: path.join(cache, 'subtract-mobile.png') });
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await submit(); await done.waitFor(); assert.match(await done.getByRole('status').textContent(), /생성 3명.*일치하여 제외 2명/);
    await page.goto(`http://127.0.0.1:${server.address().port}/?empty=1`);
    await open(); await dialog.getByRole('radio', { name: '유료 수강생 제외하기' }).check();
    await dialog.getByRole('status').filter({ hasText: '저장된 유료수강생 명단이 없습니다' }).waitFor();
    await dialog.getByLabel('새 주소록 이름').fill('빈 명단 검증'); await choose(0);
    assert.equal(await dialog.getByRole('button', { name: '새 주소록 만들기' }).isDisabled(), true);
    assert.deepEqual([...contacts], original); assert.deepEqual(errors, []);
    console.log('PASS: only saved paid-tab rosters linked to authorized courses; course labels; reject ordinary/unlinked/cross-workspace rosters and address books; empty state; union/subtract 1/3; latest roster/refunds/linked learners; pagination; rollback; desktop/mobile');
  } finally { await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); }
})().catch(error => { console.error(error); process.exitCode = 1; });
