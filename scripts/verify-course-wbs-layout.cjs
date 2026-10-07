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
const courses = [
  { id: courseId, name: '인스타그램 숏폼 대행', cohort: '1', instructorName: '김해준', webinarAt: '2026-12-14T11:00:00Z' },
  { id: '22222222-2222-4222-8222-222222222222', name: '광고 성과 실전', cohort: '2', instructorName: '이소라', webinarAt: '2026-12-16T10:30:00Z' },
  { id: '33333333-3333-4333-8333-333333333333', name: 'AI 업무 자동화', cohort: '3', instructorName: '박준호', webinarAt: '2026-12-18T10:00:00Z' },
  { id: '44444444-4444-4444-8444-444444444444', name: '콘텐츠 수익화', cohort: '4', instructorName: '최유진', webinarAt: '2026-12-20T11:00:00Z' },
  { id: '55555555-5555-4555-8555-555555555555', name: '브랜드 마케팅', cohort: '5', instructorName: '정민수', webinarAt: '2026-12-22T10:30:00Z' },
];
const bootstrap = {
  courses,
  wbsSummaries: courses.map((course, index) => ({
    courseId: course.id,
    itemCount: 2 + index,
    completedCount: 1,
    updatedAt,
  })),
  dashboard: {
    savedWbsCount: 5,
    totalItemCount: 20,
    completedItemCount: 5,
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

let records;
let deleteRequests = 0;
function resetRecords() {
  records = new Map(courses.map((course, index) => [course.id, {
    ...wbs, courseId: course.id,
    items: wbs.items.map(item => ({ ...item, startDate: index === 0 ? item.startDate : `2026-12-${String(6 + index).padStart(2, '0')}` })),
  }]));
}
function overview() {
  return {
    ...bootstrap,
    wbsSummaries: [...records.values()].map(record => ({ courseId: record.courseId, itemCount: record.items.length, completedCount: record.items.filter(item => item.completed).length, updatedAt: record.updatedAt })),
    schedules: [...records.values()].map(record => ({ courseId: record.courseId, items: record.items })),
  };
}

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
    server = http.createServer(async (request, response) => {
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
        response.end(JSON.stringify(overview()));
      } else if (pathname.startsWith('/api/course-wbs/')) {
        const id = pathname.split('/').at(-1);
        const course = courses.find(course => course.id === id);
        if (request.method === 'DELETE') {
          deleteRequests++;
          records.delete(id);
          response.statusCode = 204;
          response.end();
          return;
        }
        if (request.method === 'PUT') {
          let body = '';
          for await (const chunk of request) body += chunk;
          records.set(id, { courseId: id, items: JSON.parse(body).items, updatedAt: '2026-10-07T01:00:00Z' });
        }
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ wbs: records.get(id) ?? null, webinarAt: course?.webinarAt ?? null }));
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
      resetRecords();
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.getByText('김해준 · 1기 · 2026-12-14 · 20:00', { exact: true }).waitFor();

      assert.equal(await page.getByRole('heading', { name: '강의 WBS', exact: true }).count(), 0);
      assert.equal(await page.getByLabel('강의 WBS 상단').getByText('강의 WBS', { exact: true }).count(), 1);
      assert.equal(await page.getByText('저장된 WBS', { exact: true }).count(), 0);
      assert.equal(await page.getByText('연결된 강의를 선택하면 해당 WBS를 열 수 있습니다.', { exact: true }).count(), 0);
      assert.equal(await page.getByText(/마지막 저장/u).count(), 0);
      assert.equal(await page.getByText('김해준', { exact: true }).count(), 0);
      assert.equal(await page.getByText('1기', { exact: true }).count(), 0);
      assert.equal(await page.getByText('무료 웨비나', { exact: true }).count(), 0);
      const cardBoxes = await page.getByLabel('저장된 강의 WBS').getByRole('button', { name: /WBS 열기/u }).evaluateAll(cards => cards.map(card => {
        const box = card.getBoundingClientRect();
        return { left: Math.round(box.left), top: Math.round(box.top) };
      }));
      assert.equal(cardBoxes.length, 5);
      if (width === 1440) assert.equal(new Set(cardBoxes.map(box => box.top)).size, 1, 'desktop cards are not in one five-card row');
      else assert.equal(new Set(cardBoxes.map(box => box.left)).size, 1, 'mobile cards are not in one column');
      await assertNoPageOverflow(page, `saved WBS ${width}px`);
      await page.screenshot({ path: path.join(output, `saved-wbs-${width}.png`), fullPage: true });

      const createButton = page.getByRole('button', { name: 'WBS 만들기', exact: true });
      const createBox = await createButton.boundingBox();
      assert.ok(createBox.y < cardBoxes[0].top, 'create button must be above cards');
      await createButton.click();
      await page.getByRole('dialog').getByText('모든 강의에 WBS가 연결되어 있습니다.', { exact: true }).waitFor();
      await page.keyboard.press('Escape');
      await page.getByLabel('WBS 항목', { exact: true }).selectOption('task-2');
      const schedule = page.getByRole('table', { name: '홍보 강의별 시작 일정', exact: true });
      await schedule.waitFor();
      assert.equal(await schedule.locator('tbody tr').count(), 5);
      assert.match(await schedule.locator('tbody tr').first().innerText(), /인스타그램 숏폼 대행.*2026-12-04.*D-10/su);
      await assertNoPageOverflow(page, `item schedule ${width}px`);

      await page.getByRole('tab', { name: '업무 현황', exact: true }).click();
      await page.getByText('전체 진행 상황', { exact: true }).waitFor();
      assert.equal(await page.getByText('WBS 대시보드', { exact: true }).count(), 0);
      assert.equal(await page.getByText('저장된 WBS 전체의 진행 상황과 지금 먼저 처리할 업무입니다.', { exact: true }).count(), 0);
      await assertNoPageOverflow(page, `WBS dashboard ${width}px`);

      await page.getByRole('tab', { name: 'WBS 관리', exact: true }).click();
      await page.getByRole('button', { name: /김해준 · 인스타그램 숏폼 대행 · 1기 WBS 열기/u }).click();
      const detailHeading = '김해준 • 1기 • 인스타그램 숏폼 대행 • 2026-12-14 • 20:00';
      await page.getByLabel('강의 WBS 상단').getByText(detailHeading, { exact: true }).waitFor();
      const actions = page.getByRole('group', { name: 'WBS 작업', exact: true });
      const courseDetail = actions.getByRole('link', { name: '강의 상세', exact: true });
      const saveWbs = actions.getByRole('button', { name: '강의 WBS 저장', exact: true });
      await saveWbs.waitFor();
      assert.equal(await page.getByRole('button', { name: '강의 WBS 저장', exact: true }).count(), 1);
      const [detailBox, saveBox] = await Promise.all([courseDetail.boundingBox(), saveWbs.boundingBox()]);
      assert.ok(detailBox && saveBox && saveBox.x > detailBox.x, `${width}px: save button is not right of course detail`);
      assert.equal(await page.getByRole('button', { name: 'WBS 목록', exact: true }).count(), 0);
      assert.equal(await page.getByLabel('연결된 강의').count(), 0);
      assert.equal(await page.getByText('담당자·관계자는 목록에서 선택하거나 새 이름을 입력한 뒤 저장할 수 있습니다.', { exact: true }).count(), 0);
      assert.equal(await page.getByText(/마지막 저장/u).count(), 0);
      await page.getByRole('textbox', { name: '2번째 업무 제목', exact: true }).focus();
      await page.getByRole('table', { name: '홍보 강의별 시작 일정', exact: true }).waitFor();
      await page.getByRole('button', { name: '간소화목록', exact: true }).click();
      await page.getByRole('button', { name: '기획', exact: true }).click();
      await page.getByRole('table', { name: '기획 강의별 시작 일정', exact: true }).waitFor();
      await page.getByRole('button', { name: '간트 차트', exact: true }).click();
      await page.getByRole('button', { name: '홍보', exact: true }).click();
      await page.getByRole('table', { name: '홍보 강의별 시작 일정', exact: true }).waitFor();
      await assertNoPageOverflow(page, `course WBS detail ${width}px`);
      await page.screenshot({ path: path.join(output, `course-wbs-detail-${width}.png`), fullPage: true });

      // Reload the overview, then exercise cancel, failure, successful delete, and recreation.
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const target = courses.at(-1);
      const menu = page.getByRole('button', { name: '정민수 · 브랜드 마케팅 · 5기 WBS 메뉴', exact: true });
      await menu.click();
      await page.getByRole('menuitem', { name: 'WBS 삭제', exact: true }).click();
      const beforeCancel = deleteRequests;
      await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
      assert.equal(deleteRequests, beforeCancel);
      await menu.click();
      await page.getByRole('menuitem', { name: 'WBS 삭제', exact: true }).click();
      await page.route(`**/api/course-wbs/${target.id}`, async route => {
        if (route.request().method() === 'DELETE') await route.fulfill({ status: 500, json: { message: '삭제 오류 테스트' } });
        else await route.continue();
      });
      await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
      await page.getByRole('dialog').getByRole('alert').getByText('삭제 오류 테스트').waitFor();
      assert.equal(await page.getByLabel('저장된 강의 WBS').getByRole('button', { name: /WBS 열기/u, includeHidden: true }).count(), 5);
      await page.unroute(`**/api/course-wbs/${target.id}`);
      await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('status').getByText('강의 WBS를 삭제했습니다.').waitFor();
      assert.equal(await page.getByLabel('저장된 강의 WBS').getByRole('button', { name: /WBS 열기/u }).count(), 4);
      await page.getByRole('button', { name: 'WBS 만들기', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('연결할 강의', { exact: true }).selectOption(target.id);
      assert.equal(await dialog.getByRole('combobox').locator('option').count(), 2, 'only courses without WBS may be linked');
      await assertNoPageOverflow(page, `create dialog ${width}px`);
      await dialog.getByRole('button', { name: 'WBS 만들기', exact: true }).click();
      await page.getByRole('button', { name: '강의 WBS 저장', exact: true }).click();
      await page.getByRole('status').getByText('이 강의의 WBS를 저장했습니다.').waitFor();
      assert.ok(records.has(target.id), 'new WBS must persist');
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
