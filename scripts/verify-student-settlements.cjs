/* eslint-disable @typescript-eslint/no-require-imports -- Real component browser regression harness. */
// Run: node scripts/verify-student-settlements.cjs
// Requires Playwright with Chromium installed. Set PLAYWRIGHT_PACKAGE_PATH when
// using an existing Playwright installation outside this repository.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

// Every request and save stays on loopback. No application DB is used.
const fixtureCourses = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: '인스타그램 숏폼 대행', cohort: '1', instructor_name: '김해준',
    free_webinar_at: '2026-12-14T11:00:00Z', order_count: 2,
    payment_amount: 120000.25, paid_student_count: 3, total_cost: 10000.1,
    nova_settled: true, instructor_settled: false,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'AI 수익화 공식', cohort: '2', instructor_name: '미닝',
    free_webinar_at: '2026-12-01T10:30:00Z', order_count: 4,
    payment_amount: 50000.15, paid_student_count: 2, total_cost: 20000.2,
    nova_settled: false, instructor_settled: true,
  },
];

const expectedHeaders = [
  '강의명', '기수', '강사명', '웨비나 날짜', '주문', '전체 결제금액',
  '유료수강생', '전체 비용', '노바 정산', '강사 정산', '관리',
];

async function eventually(check, description) {
  const deadline = Date.now() + 10000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out: ${description}${lastError ? ` (${lastError.message})` : ''}`);
}

function checkbox(page, courseIndex, field) {
  return page.getByRole('checkbox', {
    name: `${fixtureCourses[courseIndex].name} ${field === 'nova' ? '노바 정산' : '강사 정산'}`,
    exact: true,
  });
}

async function assertContainedTable(page, width, label) {
  const geometry = await page.locator('table').evaluate(table => {
    let scroller = table.parentElement;
    while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX)) {
      scroller = scroller.parentElement;
    }
    return {
      viewport: innerWidth,
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      scrollWidth: scroller?.scrollWidth,
      clientWidth: scroller?.clientWidth,
    };
  });
  assert.ok(geometry.bodyWidth <= geometry.viewport + 1, `${label}: body overflows ${JSON.stringify(geometry)}`);
  assert.ok(geometry.documentWidth <= geometry.viewport + 1, `${label}: page overflows ${JSON.stringify(geometry)}`);
  if (width === 390) {
    assert.ok(geometry.scrollWidth > geometry.clientWidth, `${label}: mobile table has no scoped horizontal scroll`);
  }
}

(async () => {
  let browser, server;
  let courses = structuredClone(fixtureCourses);
  let requests = [];
  let pendingPatches = [];
  let unexpectedApiRequests = [];
  let holdPatches = false;
  let failNextPatch = false;
  const output = path.resolve('tmp/student-settlements');
  await fs.mkdir(output, { recursive: true });
  console.log('Bundling the actual settlement overview...');
  const bundle = await esbuild.build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
        import {StudentSettlementOverview} from './src/components/course-operations/student-settlement-overview';
        const courses = await fetch('/fixture.json').then(response => response.json());
        const noop = () => {};
        const router = {back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop};
        createRoot(document.getElementById('root')).render(
          <AppRouterContext.Provider value={router}>
            <main className="min-h-screen bg-background">
              <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8">
                <StudentSettlementOverview courses={courses} />
              </div>
            </main>
          </AppRouterContext.Provider>);`,
      loader: 'tsx', resolveDir: process.cwd(),
    },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic',
  });
  console.log('Compiling application CSS...');
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
      else if (pathname === '/fixture.json') json(courses);
      else if (/^\/api\/course-operations\/[^/]+\/payment-summary$/.test(pathname) && req.method === 'PATCH') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const payload = JSON.parse(raw);
        const id = pathname.split('/')[3];
        const fail = failNextPatch;
        failNextPatch = false;
        requests.push({ id, payload });
        const respond = () => {
          if (fail) {
            res.statusCode = 500;
            json({ message: '검증용 저장 실패입니다.' });
            return;
          }
          const course = courses.find(item => item.id === id);
          if (!course) {
            res.statusCode = 404;
            json({ message: '강의를 찾을 수 없습니다.' });
            return;
          }
          if ('cohort' in payload) course.cohort = payload.cohort;
          if ('novaSettled' in payload) course.nova_settled = payload.novaSettled;
          if ('instructorSettled' in payload) course.instructor_settled = payload.instructorSettled;
          json({ id });
        };
        if (holdPatches) pendingPatches.push(respond);
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
    console.log('Launching Chromium...');
    browser = await chromium.launch({ headless: true });

    for (const width of [1440, 390]) {
      courses = structuredClone(fixtureCourses);
      requests = [];
      pendingPatches = [];
      unexpectedApiRequests = [];
      holdPatches = false;
      failNextPatch = false;
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
      const label = `settlements-${width}`;
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await checkbox(page, 0, 'nova').waitFor();

      assert.equal(await page.getByRole('tab').count(), 0, `${label}: obsolete tabs still rendered`);
      assert.equal(await page.getByRole('tablist').count(), 0, `${label}: obsolete tab bar still rendered`);
      assert.equal(await page.locator('table').count(), 1, `${label}: only the course list should render`);
      assert.deepEqual((await page.locator('thead th').allTextContents()).map(value => value.trim()), expectedHeaders);
      const firstRow = page.locator('tbody tr').first();
      const totals = await firstRow.innerText();
      for (const value of ['전체 합계', '6건', '170,000.4원', '5명', '30,000.3원']) {
        assert.ok(totals.includes(value), `${label}: totals missing ${value}: ${totals}`);
      }
      for (let index = 0; index < fixtureCourses.length; index++) {
        const cells = page.locator('tbody tr').nth(index + 1).locator('td');
        assert.equal((await cells.nth(0).innerText()).trim(), fixtureCourses[index].name);
        assert.equal((await cells.nth(1).innerText()).trim(), `${fixtureCourses[index].cohort}기`);
        assert.equal((await cells.nth(2).innerText()).trim(), fixtureCourses[index].instructor_name);
        assert.equal(await checkbox(page, index, 'nova').isChecked(), fixtureCourses[index].nova_settled);
        assert.equal(await checkbox(page, index, 'instructor').isChecked(), fixtureCourses[index].instructor_settled);
      }
      assert.deepEqual(requests, []);
      await assertContainedTable(page, width, `${label} course list`);
      await page.screenshot({ path: path.join(output, `${label}-courses.png`), fullPage: true });

      // Optimistic saves are isolated by course; neither field can overwrite a
      // pending change on the same row, but another course remains editable.
      holdPatches = true;
      await checkbox(page, 0, 'nova').click();
      await eventually(() => pendingPatches.length === 1, 'first held PATCH');
      assert.equal(await checkbox(page, 0, 'nova').isDisabled(), true);
      assert.equal(await checkbox(page, 0, 'instructor').isDisabled(), true);
      assert.equal(await checkbox(page, 1, 'nova').isEnabled(), true);
      await checkbox(page, 1, 'nova').click();
      await eventually(() => pendingPatches.length === 2, 'concurrent course PATCH');
      assert.deepEqual(requests, [
        { id: fixtureCourses[0].id, payload: { novaSettled: false } },
        { id: fixtureCourses[1].id, payload: { novaSettled: true } },
      ]);
      pendingPatches.shift()();
      pendingPatches.shift()();
      holdPatches = false;
      await eventually(() => checkbox(page, 0, 'nova').isEnabled(), 'first save finished');
      await eventually(() => checkbox(page, 1, 'nova').isEnabled(), 'second save finished');
      await page.reload();
      await checkbox(page, 0, 'nova').waitFor();
      assert.equal(await checkbox(page, 0, 'nova').isChecked(), false);
      assert.equal(await checkbox(page, 1, 'nova').isChecked(), true);
      assert.equal(courses[0].cohort, '1');
      assert.equal(courses[1].instructor_settled, true);

      // A rejected save restores the persisted checkbox and exposes an error.
      holdPatches = true;
      failNextPatch = true;
      await checkbox(page, 0, 'instructor').click();
      await eventually(() => pendingPatches.length === 1, 'held failed PATCH');
      assert.equal(await checkbox(page, 0, 'instructor').isChecked(), true);
      pendingPatches.shift()();
      holdPatches = false;
      await eventually(() => checkbox(page, 0, 'instructor').isEnabled(), 'failed save finished');
      assert.equal(await checkbox(page, 0, 'instructor').isChecked(), false);
      await page.getByRole('alert').filter({ hasText: '검증용 저장 실패입니다.' }).waitFor();
      assert.equal(courses[0].instructor_settled, false);
      assert.deepEqual(requests.at(-1).payload, { instructorSettled: true });

      // A retry clears the error, saves the intended field, and keeps other flags.
      await checkbox(page, 0, 'instructor').click();
      await eventually(() => courses[0].instructor_settled === true, 'retry save');
      await eventually(() => checkbox(page, 0, 'instructor').isEnabled(), 'retry save finished');
      assert.deepEqual(requests.at(-1).payload, { instructorSettled: true });
      assert.equal(await page.getByRole('alert').count(), 0);
      assert.equal(await checkbox(page, 0, 'instructor').isChecked(), true);

      // Repeated changes after successful saves use the latest persisted value.
      await checkbox(page, 0, 'nova').click();
      await eventually(() => courses[0].nova_settled === true, 'course-table save');
      await eventually(() => checkbox(page, 0, 'nova').isEnabled(), 'course-table save finished');
      assert.equal(await checkbox(page, 0, 'nova').isChecked(), true);
      await checkbox(page, 0, 'nova').click();
      await eventually(() => courses[0].nova_settled === false, 'second course-table save');
      await eventually(() => checkbox(page, 0, 'nova').isEnabled(), 'second course-table save finished');
      assert.equal(await checkbox(page, 0, 'nova').isChecked(), false);
      assert.equal(await checkbox(page, 0, 'instructor').isChecked(), true);
      await page.reload();
      await checkbox(page, 0, 'instructor').waitFor();
      assert.equal(await checkbox(page, 0, 'instructor').isChecked(), true);
      assert.equal(await checkbox(page, 0, 'nova').isChecked(), false);
      assert.equal(await checkbox(page, 1, 'nova').isChecked(), true);
      assert.equal(await page.getByRole('tab').count(), 0);
      assert.deepEqual(unexpectedApiRequests, [], `${label}: obsolete or unexpected API request`);
      await assertContainedTable(page, width, `${label} reopened course list`);
      await page.screenshot({ path: path.join(output, `${label}-reopened.png`), fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`PASS ${label}: no tabs/extra GET, columns, totals, existing checks, partial PATCH, concurrent rows, rollback/retry, repeated saves, persisted reload, scoped overflow`);
      await page.close();
    }
  } finally {
    for (const respond of pendingPatches) respond();
    await browser?.close();
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
