/* eslint-disable @typescript-eslint/no-require-imports -- Isolated API and browser integration. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { build } = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let browser, server;
  const cache = path.resolve('.cache/contact-courses');
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const workspace = id(99), phone = '01012345678';
  const book = { id: id(80), name: '테스트 주소록', workspace_id: workspace, contact_count: 2, updated_at: '2026-10-14' };
  const contacts = [{ id: id(81), address_book_id: book.id, name: '홍길동', email: '', normalized_phone: phone }, { id: id(82), address_book_id: book.id, name: '명단없는학생', email: '', normalized_phone: '01055555555' }];
  const rosters = [1, 2, 3, 4, 5, 6, 7].map(n => ({ id: id(n), workspace_id: workspace, latest_version: 3, is_order_roster: n !== 4, course: n === 5 ? null : { id: id(90 + n), workspace_id: n === 6 ? id(98) : workspace, name: `미닝 강의 ${n}`, instructor_name: '미닝', cohort: `${n}기`, free_webinar_at: '2026-10-01T10:00:00Z' } }));
  const row = (job, n, extra = {}, version = 3) => ({ id: id(job * 10000 + n), job_id: id(job), version, source_row_number: n, normalized_phone: phone, normalized_values: { customerName: '학생', ...extra } });
  const rows = [
    ...Array.from({ length: 1000 }, (_, n) => ({ ...row(1, n), normalized_phone: '01000000000' })), row(1, 1001),
    row(2, 1, { hasDifferentStudent: true, studentName: '홍길동', studentPhone: '+82 10-1234-5678' }), row(2, 2),
    row(3, 1, { refundedAt: '2026-10-01' }), row(3, 2, {}, 2), row(4, 1), row(5, 1), row(6, 1),
    row(7, 1, { hasDifferentStudent: true, studentName: '다른 학생', studentPhone: '01099999999' }),
  ];
  let authenticated = true, authorized = true, failRead = false, slow = false;
  global.__contactUser = () => authenticated ? { id: id(100) } : null;
  global.__contactAdmin = { from(table) {
    const filters = []; let from = 0, to = Infinity;
    const execute = () => {
      if (table === 'job_enrollments' && failRead) return { data: null, error: { code: 'fixture' } };
      const source = table === 'address_books' ? [book] : table === 'workspace_members' ? authorized ? [{ workspace_id: workspace, user_id: id(100) }] : [] : table === 'address_book_contacts' ? contacts : table === 'course_jobs' ? rosters : rows;
      return { data: source.filter(row => filters.every(([key, value]) => key.split('.').reduce((item, part) => item?.[part], row) === value)).slice(from, to + 1), error: null };
    };
    const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, returns() { return query; }, order() { return query; }, range(start, end) { from = start; to = end; return query; },
      async maybeSingle() { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; }, then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
    }; return query;
  } };
  try {
    await fs.mkdir(cache, { recursive: true });
    const api = await build({ entryPoints: ['src/app/api/address-books/[bookId]/contacts/[contactId]/courses/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'services', setup(b) {
      b.onResolve({ filter: /^(server-only|@\/lib\/supabase\/(server|admin|auth))$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'server-only' ? '' : args.path.endsWith('admin') ? 'export const createAdminClient=()=>global.__contactAdmin' : args.path.endsWith('auth') ? 'export const getAuthenticatedUser=async()=>global.__contactUser()' : 'export const createClient=async()=>({})' }));
    } }] });
    const apiPath = path.join(cache, 'route.cjs'); await fs.writeFile(apiPath, api.outputFiles[0].text);
    const { GET } = require(apiPath);
    const get = (contactId = id(81), bookId = book.id) => GET(new Request('http://fixture/api'), { params: Promise.resolve({ bookId, contactId }) });
    authenticated = false; assert.equal((await get()).status, 401); authenticated = true;
    authorized = false; assert.equal((await get()).status, 403); authorized = true;
    assert.equal((await get('bad')).status, 400); assert.equal((await get(id(83))).status, 404); assert.equal((await get(id(81), id(90))).status, 404);
    contacts[0].address_book_id = id(90); assert.equal((await get()).status, 404); contacts[0].address_book_id = book.id;
    const response = await get(); assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const result = await response.json(); assert.deepEqual(result.courses.map(c => c.id), [id(91), id(92)]);
    assert.deepEqual(Object.keys(result.courses[0]).sort(), ['cohort', 'id', 'instructorName', 'name']);
    assert.equal((await (await get(id(82))).json()).courses.length, 0);
    failRead = true; assert.equal((await get()).status, 500); failRead = false;
    const before = structuredClone(rows);
    // Exercise the real paid-students route with an isolated transaction boundary.
    let paymentWrites = 0, refundMode = false;
    const paymentState = { courseName: '강의', webinarDate: '2026-10-01', jobId: id(1), version: 1,
      orders: [{ id: id(10), record_key: 'new-key', product_name: '새 강의', option_name: '심화반', member_name: '학생', phone, email: '', status: '결제완료', payment_date: '2026-10-02', payment_amount: 200000, current_amount: 200000, refund_amount: 0, payment_id: 'payment-1' }],
      enrollments: [{ id: id(11), source_row_number: 2, normalized_phone: phone, normalized_values: { customerName: '학생', productName: '이전 강의', optionName: '기본반', paymentAmount: '100000', orderRecordKey: 'old-key', paymentId: 'payment-1' }, original_values: {}, student_id: null, is_extra_participant: false, is_manually_added: false }] };
    global.__paymentAuthorize = async () => ({ user: { id: id(100) }, admin: { rpc: async (name, args) => {
      if (name === 'paid_roster_snapshot') return { data: structuredClone(paymentState), error: null };
      if (refundMode) {
        assert.equal(name,'apply_paid_roster_review');
        assert.equal(args.p_changes.length,1); assert.equal(args.p_changes[0].kind,'remove');
        assert.equal(args.p_changes[0].targetId,id(11)); paymentWrites++;
        return {data:id(1),error:null};
      }
      assert.equal(name, 'apply_paid_roster_changes');
      assert.deepEqual(args.p_changes, [{ kind: 'update', orderId: id(10), targetId: id(11), removeIds: [] }]);
      paymentWrites++; return { data: id(1), error: null };
    } } });
    const paymentApi = await build({ entryPoints: ['src/app/api/course-operations/[courseId]/paid-students/route.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'payment-services', setup(b) {
      b.onResolve({ filter: /^(server-only|@\/lib\/course-orders\/server)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'server-only' ? '' : 'export class CourseOrderError extends Error {constructor(message,status=400){super(message);this.status=status}};export const authorizeCourseOrders=()=>global.__paymentAuthorize();export const courseOrderErrorResponse=e=>Response.json({message:e.message},{status:e.status||500});' }));
    } }] });
    const paymentPath = path.join(cache, 'payment-route.cjs'); await fs.writeFile(paymentPath, paymentApi.outputFiles[0].text);
    const paymentPost = require(paymentPath).POST;
    const pay = body => paymentPost(new Request('http://fixture/api', { method: 'POST', body: JSON.stringify({ orderIds: [id(10)], ...body }) }), { params: Promise.resolve({ courseId: id(90) }) });
    const paymentPreview = await (await pay({ action: 'preview' })).json();
    assert.equal(paymentWrites, 0); assert.equal(paymentPreview.changes[0].after.productName, '새 강의');
    assert.equal((await pay({ action: 'apply', token: 'stale', selectedIds: [id(10)] })).status, 409);
    paymentState.orders[0].payment_amount = 300000;
    assert.equal((await pay({ action: 'apply', token: paymentPreview.token, selectedIds: [id(10)] })).status, 409);
    assert.equal(paymentWrites, 0); paymentState.orders[0].payment_amount = 200000;
    const paymentResult = await (await pay({ action: 'apply', token: paymentPreview.token, selectedIds: [id(10)] })).json();
    assert.deepEqual({ added: paymentResult.addedCount, updated: paymentResult.updatedCount, removed: paymentResult.removedCount }, { added: 0, updated: 1, removed: 0 });
    assert.equal(paymentWrites, 1);
    refundMode = true; paymentState.orders[0].status = '환불';
    paymentState.enrollments[0].normalized_values.orderRecordKey = 'new-key';
    const refundPreview = await (await pay({action:'preview',orderIds:[]})).json();
    assert.equal(refundPreview.changes.length,1); assert.equal(refundPreview.changes[0].exclusionReason,'refund');
    const refundResult = await (await pay({action:'apply',orderIds:[],token:refundPreview.token,selectedIds:[id(11)]})).json();
    assert.equal(refundResult.removedCount,1); assert.equal(paymentWrites,2);
    const preview = { token: 'fixture', unchangedCount: 0, conflicts: [], changes: [{ id: id(1), orderId: id(1), targetId: id(2), removeIds: [], kind: 'update', name: '결제학생', phone, reason: '결제항목 또는 결제금액이 변경되었습니다.', before: { productName: '이전 강의', optionName: '기본반', paymentAmount: 100000 }, after: { productName: '새 강의', optionName: '심화반', paymentAmount: 200000 } }] };
    preview.changes.push({...refundPreview.changes[0],name:'환불학생'});
    preview.changes.push({...refundPreview.changes[0],id:id(12),targetId:id(12),name:'주문누락학생',exclusionReason:'missing_order'});
    const ui = await build({ stdin: { contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AddressBookDetail}from'./src/components/address-books/address-book-detail';import{PaidRosterChangesDialog}from'./src/components/course-operations/paid-roster-changes-dialog';function App(){const[open,setOpen]=useState(false);return <><AddressBookDetail mode="manager" book={${JSON.stringify(book)}} contacts={${JSON.stringify(contacts)}} totalContacts={2} currentPage={1} contactsPerPage={100} initialKeyword="" initialSort="nameAsc" templates={[]} history={[]}/><button onClick={()=>setOpen(true)}>변경 테스트</button>{open&&<PaidRosterChangesDialog preview={${JSON.stringify(preview)}} onClose={()=>setOpen(false)} onApply={async ids=>{window.applied=ids;setOpen(false)}}/>}</>};createRoot(document.getElementById('root')).render(<App/>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env': '{}' }, plugins: [{ name: 'router', setup(b) {
      b.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents: args.path.endsWith('link') ? "import React from 'react';export default function Link(p){return React.createElement('a',p)}" : 'export const useRouter=()=>({push(){},refresh(){}})' }));
    } }] });
    const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' })).css;
    server = http.createServer(async (req, res) => {
      if (req.url.startsWith('/api/')) {
        if (slow) await new Promise(resolve => setTimeout(resolve, 500));
        const response = await get(req.url.split('/')[5]);
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
    const open = () => page.getByRole('button', { name: '홍길동', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await open(); await dialog.getByRole('link', { name: '미닝 강의 1' }).waitFor();
    assert.equal(await dialog.getByRole('link').count(), 2); assert.equal(await dialog.getByText('2기', { exact: true }).count(), 1);
    assert.ok((await dialog.getByRole('link', { name: '미닝 강의 1' }).getAttribute('href')).endsWith(`${id(91)}?tab=paid-students`));
    await dialog.screenshot({ path: path.join(cache, 'desktop.png') });
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 }); failRead = true; await open(); await dialog.getByRole('alert').waitFor(); failRead = false;
    await dialog.getByRole('button', { name: '다시 시도' }).click(); await dialog.getByRole('link', { name: '미닝 강의 1' }).waitFor();
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true); await dialog.screenshot({ path: path.join(cache, 'mobile.png') });
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    slow = true; await open(); await dialog.getByRole('status').waitFor(); await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByRole('button', { name: '명단없는학생', exact: true }).click(); await dialog.getByText('저장된 유료수강생 명단에 포함된 강의가 없습니다.').waitFor();
    assert.equal(await dialog.getByRole('link').count(), 0); slow = false;
    await dialog.getByRole('button', { name: '닫기', exact: true }).click(); await page.getByRole('button', { name: '변경 테스트' }).click();
    assert.equal(await dialog.getByRole('checkbox', { name: '결제학생 변경 반영' }).getAttribute('aria-checked'), 'true');
    assert.equal(await dialog.getByRole('checkbox',{name:'환불학생 명단 제외 승인'}).getAttribute('aria-checked'),'true');
    assert.equal(await dialog.getByRole('checkbox',{name:'주문누락학생 명단 제외 승인'}).getAttribute('aria-checked'),'false');
    await dialog.getByText('새 강의', { exact: true }).waitFor(); await dialog.getByText('200,000원', { exact: true }).waitFor();
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true); await dialog.screenshot({ path: path.join(cache, 'payment-change.png') });
    await dialog.getByRole('button', { name: /선택.*반영/ }).click();
    assert.deepEqual(await page.evaluate(() => window.applied), [id(1), id(11)]);
    assert.deepEqual(rows, before); assert.deepEqual(errors, []);
    console.log('PASS: contact API auth/workspace/book ownership/latest roster/1000+ rows/linked learner/refunds/no writes; name click/details/link/empty/error/retry/stale request/desktop/mobile; payment item/amount preview and default-selected updates');
  } finally { await browser?.close(); await new Promise(resolve => server ? server.close(resolve) : resolve()); }
})().catch(error => { console.error(error); process.exitCode = 1; });
