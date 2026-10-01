/* eslint-disable @typescript-eslint/no-require-imports -- Real component browser regression harness. */
// Run: node scripts/verify-course-wbs-layout.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

const courseId = '11111111-1111-4111-8111-111111111111';
const updatedAt = '2026-10-02T01:00:00Z';
const bootstrap = {
  courses: [{
    id: courseId,
    name: '인스타그램 숏폼 대행',
    cohort: '1',
    instructorName: '김해준',
    webinarAt: '2026-12-14T11:00:00Z',
  }],
  wbsSummaries: [{ courseId, itemCount: 2, completedCount: 1, updatedAt }],
  dashboard: {
    savedWbsCount: 1,
    totalItemCount: 2,
    completedItemCount: 1,
    overdueTasks: [],
    upcomingTasks: [],
    closestUnstartedCourseId: null,
  },
  template: { id: 'template', name: '기본', items: [], updatedAt: null, builtIn: true },
  people: [],
  employeeNames: [],
  inactivePeople: [],
};
const wbs = {
  courseId,
  updatedAt,
  items: [
    { id: 'task-1', title: '기획', owner: '', stakeholders: '', startDate: '2026-12-01', dueDate: '2026-12-03', description: '', completed: true, position: 0 },
    { id: 'task-2', title: '홍보', owner: '', stakeholders: '', startDate: '2026-12-04', dueDate: '2026-12-10', description: '', completed: false, position: 1 },
  ],
};

async function assertNoPageOverflow(page, label) {
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(geometry.body <= geometry.viewport + 1, `${label}: body overflows ${JSON.stringify(geometry)}`);
  assert.ok(geometry.document <= geometry.viewport + 1, `${label}: document overflows ${JSON.stringify(geometry)}`);
}

(async () => {
  let browser;
  let server;
  const output = path.resolve('tmp/course-wbs-layout');
  await fs.mkdir(output, { recursive: true });

  const bundle = await esbuild.build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
        import {CourseWbsWorkspace} from './src/components/course-wbs/course-wbs-workspace';
        const noop = () => {};
        const router = {back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop};
        createRoot(document.getElementById('root')).render(
          <AppRouterContext.Provider value={router}>
            <main className="min-h-screen bg-muted/20">
              <CourseWbsWorkspace initialCourseId="" canSaveTemplate={false} />
            </main>
          </AppRouterContext.Provider>);`,
      loader: 'tsx',
      resolveDir: process.cwd(),
    },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    jsx: 'automatic',
  });
  const css = await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), {
    from: path.resolve('src/app/globals.css'),
  });

  try {
    server = http.createServer((request, response) => {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      response.setHeader('Cache-Control', 'no-store');
      if (pathname === '/bundle.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(bundle.outputFiles[0].text);
      } else if (pathname === '/style.css') {
        response.setHeader('Content-Type', 'text/css');
        response.end(css.css);
      } else if (pathname === '/api/course-wbs') {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(bootstrap));
      } else if (pathname === `/api/course-wbs/${courseId}`) {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ wbs, webinarAt: bootstrap.courses[0].webinarAt }));
      } else if (pathname === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>');
      } else {
        response.statusCode = 404;
        response.end();
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });

    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.getByText('김해준 · 1기 · 2026-12-14 · 20:00', { exact: true }).waitFor();

      assert.equal(await page.getByRole('heading', { name: '강의 WBS', exact: true }).count(), 0);
      assert.equal(await page.getByText('저장된 WBS', { exact: true }).count(), 0);
      assert.equal(await page.getByText('연결된 강의를 선택하면 해당 WBS를 열 수 있습니다.', { exact: true }).count(), 0);
      assert.equal(await page.getByText(/마지막 저장/u).count(), 0);
      await assertNoPageOverflow(page, `saved WBS ${width}px`);
      await page.screenshot({ path: path.join(output, `saved-wbs-${width}.png`), fullPage: true });

      await page.getByRole('tab', { name: '업무 현황', exact: true }).click();
      await page.getByText('전체 진행 상황', { exact: true }).waitFor();
      assert.equal(await page.getByText('WBS 대시보드', { exact: true }).count(), 0);
      assert.equal(await page.getByText('저장된 WBS 전체의 진행 상황과 지금 먼저 처리할 업무입니다.', { exact: true }).count(), 0);
      await assertNoPageOverflow(page, `WBS dashboard ${width}px`);

      await page.getByRole('tab', { name: 'WBS 관리', exact: true }).click();
      await page.getByRole('button', { name: /김해준 · 인스타그램 숏폼 대행 · 1기 WBS 열기/u }).click();
      await page.getByLabel('연결된 강의').getByRole('button', { name: '강의 WBS 저장', exact: true }).waitFor();
      assert.equal(await page.getByText(/마지막 저장/u).count(), 0);
      assert.deepEqual(pageErrors, [], `browser errors at ${width}px`);
      await page.close();
    }
    console.log('Course WBS layout verification passed.');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
