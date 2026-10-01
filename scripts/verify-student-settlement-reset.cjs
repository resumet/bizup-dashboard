/* eslint-disable @typescript-eslint/no-require-imports -- Real component browser regression harness. */
// Run: node scripts/verify-student-settlement-reset.cjs
// Set PLAYWRIGHT_PACKAGE_PATH when using an external Playwright installation.
// All reset requests terminate in this loopback fixture. No application DB is used.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

const courseId = '11111111-1111-4111-8111-111111111111';
const courseName = '인스타그램 숏폼 대행 및 AI 콘텐츠 수익화 실전 강의';
const countFor = target => target === 'orders' ? 12 : 7;
const labelFor = target => target === 'orders' ? '주문내역' : '유료수강생';

async function eventually(check, description) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out: ${description}`);
}

async function assertNoOverflow(page, label, dialog = false) {
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(geometry.body <= geometry.viewport + 1, `${label}: body overflow ${JSON.stringify(geometry)}`);
  assert.ok(geometry.document <= geometry.viewport + 1, `${label}: page overflow ${JSON.stringify(geometry)}`);
  if (dialog) {
    const box = await page.getByRole('dialog').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= geometry.viewport + 1, `${label}: dialog escapes viewport`);
    const internal = await page.getByRole('dialog').evaluate(node => ({
      scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
    }));
    assert.ok(internal.scrollWidth <= internal.clientWidth + 1, `${label}: dialog content overflows ${JSON.stringify(internal)}`);
  }
}

(async () => {
  let browser, server;
  let requests = [];
  let unexpectedApiRequests = [];
  let pendingResponses = [];
  let holdResponses = false;
  const output = path.resolve('tmp/student-settlement-reset');
  await fs.mkdir(output, { recursive: true });

  console.log('Bundling the actual reset dialog and workspace...');
  const bundle = await esbuild.build({
    stdin: {
      contents: `import React, {useState} from 'react';
        import {createRoot} from 'react-dom/client';
        import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
        import {StudentSettlementReset} from './src/components/course-operations/student-settlement-reset';
        import {StudentSettlementWorkspace} from './src/components/course-operations/student-settlement-workspace';
        const options = new URLSearchParams(location.search);
        const target = options.get('target') || 'orders';
        window.__resetEvents = [];
        window.__refreshCount = 0;
        window.__ordersMountCount = 0;
        const noop = () => {};
        const router = {back: noop, forward: noop, push: noop, replace: noop, prefetch: noop,
          refresh: () => { window.__refreshCount += 1; }};
        function Fixture() {
          const [result, setResult] = useState('');
          return <AppRouterContext.Provider value={router}>
            <main className="min-h-screen bg-background">
              <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8">
                {options.get('mode') === 'workspace'
                  ? <StudentSettlementWorkspace courseId=${JSON.stringify(courseId)} initialCourseName=${JSON.stringify(courseName)}
                      instructorName="검증 강사" initialTab="orders"
                      paidRoster={<div data-testid="paid-roster-fixture">유료수강생 명단 검증</div>} />
                  : <><StudentSettlementReset courseId=${JSON.stringify(courseId)} courseName=${JSON.stringify(courseName)}
                      target={target} disabled={options.get('disabled') === '1'}
                      onReset={(resetTarget, count) => {
                        window.__resetEvents.push({target: resetTarget, count});
                        setResult(resetTarget + ':' + count);
                      }} /><output data-testid="reset-result">{result}</output></>}
              </div>
            </main>
          </AppRouterContext.Provider>;
        }
        createRoot(document.getElementById('root')).render(<Fixture />);`,
      loader: 'tsx', resolveDir: process.cwd(),
    },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic',
    plugins: [{
      name: 'isolate-unrelated-workspace-managers',
      setup(build) {
        build.onResolve({ filter: /^@\/components\/(course-costs\/course-cost-manager|course-operations\/course-orders-manager|course-settlements\/course-settlement-manager)$/ }, args => ({
          path: args.path, namespace: 'workspace-fixture',
        }));
        build.onLoad({ filter: /.*/, namespace: 'workspace-fixture' }, () => ({
          loader: 'tsx', resolveDir: process.cwd(),
          contents: `import React, {useState} from 'react';
            export function CourseOrdersManager() {
              const [mount] = useState(() => ++window.__ordersMountCount);
              return <div data-testid="orders-fixture" data-mount={mount}>주문내역 검증</div>;
            }
            export function CourseCostManager() { return <div data-testid="costs-fixture">비용 검증</div>; }
            export function CourseSettlementManager() { return <div data-testid="settlement-fixture">정산 검증</div>; }`,
        }));
      },
    }],
  });
  const css = await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), {
    from: path.resolve('src/app/globals.css'),
  });

  try {
    server = http.createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const send = (contentType, value) => {
        if (res.destroyed) return;
        res.setHeader('Content-Type', contentType);
        res.end(value);
      };
      const json = value => send('application/json; charset=utf-8', JSON.stringify(value));
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (pathname === '/bundle.js') send('text/javascript', bundle.outputFiles[0].text);
      else if (pathname === '/style.css') send('text/css', css.css);
      else if (pathname === `/api/course-operations/${courseId}/reset` && req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const payload = JSON.parse(raw);
        requests.push({ pathname, payload });
        const respond = () => {
          json({
            target: payload.target, resetCount: countFor(payload.target),
            jobId: '22222222-2222-4222-8222-222222222222', previousVersion: 2, version: 3,
          });
        };
        if (holdResponses) pendingResponses.push(respond);
        else respond();
      } else if (pathname === '/') {
        send('text/html; charset=utf-8', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>');
      } else {
        if (pathname.startsWith('/api/')) unexpectedApiRequests.push(`${req.method} ${pathname}`);
        res.statusCode = 404;
        res.end();
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });

    for (const width of [1440, 390]) {
      for (const target of ['orders', 'paid-students']) {
        requests = [];
        unexpectedApiRequests = [];
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const label = `${target}-${width}`;
        console.log(`Testing ${label}...`);
        await page.goto(`${baseUrl}/?target=${target}`);
        const trigger = page.getByRole('button', { name: `${labelFor(target)} 리셋`, exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog');
        const confirmation = dialog.getByLabel('확인을 위해 강의명을 입력해 주세요');
        const submit = dialog.getByRole('button', { name: `${labelFor(target)} 리셋 실행`, exact: true });
        assert.equal(await submit.isDisabled(), true);
        await confirmation.fill('잘못된 강의명');
        assert.equal(await submit.isDisabled(), true);
        await confirmation.fill(courseName);
        assert.equal(await submit.isEnabled(), true);
        await dialog.getByRole('button', { name: '취소', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(requests, [], `${label}: cancel sent a request`);

        await trigger.click();
        assert.equal(await confirmation.inputValue(), '');
        await confirmation.fill(`  ${courseName}  `);
        await assertNoOverflow(page, label, true);
        await page.screenshot({ path: path.join(output, `${label}-confirmation.png`), fullPage: true });

        // Abort at the browser boundary so Chromium cannot transparently retry
        // a stale keep-alive connection and turn the intended failure into success.
        await page.route(`**/api/course-operations/${courseId}/reset`, route => {
          requests.push({ pathname: `/api/course-operations/${courseId}/reset`, payload: route.request().postDataJSON() });
          return route.abort('failed');
        }, { times: 1 });
        await submit.click();
        await dialog.getByRole('alert').waitFor();
        assert.equal(await dialog.isVisible(), true);
        await eventually(() => submit.isEnabled(), `${label} network failure cleanup`);
        assert.equal((await confirmation.inputValue()).trim(), courseName);
        assert.ok((await dialog.getByRole('alert').innerText()).length > 0);
        assert.equal(requests.length, 1);
        assert.deepEqual(requests[0].payload, { target, confirmation: courseName });
        assert.deepEqual(await page.evaluate(() => window.__resetEvents), []);

        // Repeated submits in the same event turn produce only one request.
        holdResponses = true;
        await dialog.locator('form').evaluate(form => {
          form.requestSubmit();
          form.requestSubmit();
        });
        await eventually(() => pendingResponses.length === 1, `${label} held retry`);
        assert.equal(requests.length, 2, `${label}: duplicate submit created extra requests`);
        assert.deepEqual(requests[1].payload, { target, confirmation: courseName });
        assert.equal(await confirmation.isDisabled(), true);
        assert.equal(await dialog.getByRole('button', { name: '취소', exact: true }).isDisabled(), true);
        assert.equal(await dialog.getByRole('button', { name: '리셋 중…', exact: true }).isDisabled(), true);
        assert.equal(await dialog.getByRole('button', { name: 'Close', exact: true }).count(), 0);
        await page.keyboard.press('Escape');
        assert.equal(await dialog.isVisible(), true, `${label}: Escape closed a pending reset`);
        await page.mouse.click(2, 2);
        assert.equal(await dialog.isVisible(), true, `${label}: backdrop closed a pending reset`);
        assert.equal(requests.length, 2);
        await assertNoOverflow(page, `${label} pending`, true);
        pendingResponses.shift()();
        holdResponses = false;
        await dialog.waitFor({ state: 'hidden' });
        assert.deepEqual(await page.evaluate(() => window.__resetEvents), [{ target, count: countFor(target) }]);
        assert.equal(await page.getByTestId('reset-result').innerText(), `${target}:${countFor(target)}`);
        await trigger.click();
        assert.equal(await confirmation.inputValue(), '');
        assert.equal(await dialog.getByRole('alert').count(), 0);
        await dialog.getByRole('button', { name: '취소', exact: true }).click();
        assert.equal(requests.length, 2);
        await page.goto(`${baseUrl}/?target=${target}&disabled=1`);
        assert.equal(await trigger.isDisabled(), true);
        assert.deepEqual(unexpectedApiRequests, []);
        assert.deepEqual(errors, []);
        console.log(`PASS ${label}: confirmation, cancel, exact payload, network failure/retry, duplicate lock, pending close lock, callback, disabled trigger, overflow`);
        await page.close();
      }

      requests = [];
      unexpectedApiRequests = [];
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${baseUrl}/?mode=workspace`);
      await page.getByTestId('orders-fixture').waitFor();
      assert.deepEqual(await page.getByRole('tab').allTextContents(), ['주문내역', '유료수강생', '비용', '정산']);
      assert.equal(await page.getByRole('button', { name: '주문내역 리셋', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: '유료수강생 리셋', exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.__ordersMountCount), 1);
      await assertNoOverflow(page, `workspace-${width}`);

      // The workspace success callback refreshes server data and remounts orders.
      await page.getByRole('button', { name: '주문내역 리셋', exact: true }).click();
      await page.getByRole('dialog').getByLabel('확인을 위해 강의명을 입력해 주세요').fill(courseName);
      await page.getByRole('button', { name: '주문내역 리셋 실행', exact: true }).click();
      await page.getByRole('status').filter({ hasText: '주문내역 12건을 리셋했습니다.' }).waitFor();
      assert.equal(await page.evaluate(() => window.__refreshCount), 1);
      assert.equal(await page.evaluate(() => window.__ordersMountCount), 2);
      assert.deepEqual(requests[0].payload, { target: 'orders', confirmation: courseName });

      for (const [tab, testId] of [['비용', 'costs-fixture'], ['정산', 'settlement-fixture']]) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await page.getByTestId(testId).waitFor();
        assert.equal(await page.getByRole('button', { name: /리셋$/ }).count(), 0, `${tab}: unexpected reset button`);
      }
      await page.getByRole('tab', { name: '유료수강생', exact: true }).click();
      await page.getByTestId('paid-roster-fixture').waitFor();
      assert.equal(await page.getByRole('button', { name: '주문내역 리셋', exact: true }).count(), 0);
      await page.getByRole('button', { name: '유료수강생 리셋', exact: true }).click();
      await page.getByRole('dialog').getByLabel('확인을 위해 강의명을 입력해 주세요').fill(courseName);
      await page.getByRole('button', { name: '유료수강생 리셋 실행', exact: true }).click();
      await page.getByRole('status').filter({ hasText: '유료수강생 7명의 현재 명단을 리셋했습니다.' }).waitFor();
      assert.equal(await page.evaluate(() => window.__refreshCount), 2);
      assert.deepEqual(requests[1].payload, { target: 'paid-students', confirmation: courseName });
      assert.equal(requests.length, 2);
      await assertNoOverflow(page, `workspace-${width} paid students`);
      await page.screenshot({ path: path.join(output, `workspace-${width}.png`), fullPage: true });
      assert.deepEqual(unexpectedApiRequests, []);
      assert.deepEqual(errors, []);
      console.log(`PASS workspace-${width}: four tabs, target-specific buttons, costs/settlement exclusion, refresh/remount callbacks, scoped payload, overflow`);
      await page.close();
    }
  } finally {
    for (const respond of pendingResponses) respond();
    await browser?.close();
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
