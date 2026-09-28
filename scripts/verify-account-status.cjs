/* eslint-disable @typescript-eslint/no-require-imports -- Browser verification harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let server, browser;
  try {
    const bundle = await esbuild.build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {UserStatusToggle} from './src/components/admin/user-status-toggle';import {CourseWbsWorkspace} from './src/components/course-wbs/course-wbs-workspace';createRoot(document.getElementById('root')).render(<><UserStatusToggle userId="user" email="test@example.com" initialActive={true}/><CourseWbsWorkspace initialCourseId="course" canSaveTemplate={false}/></>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env': '{}' }, plugins: [{ name: 'router-mock', setup(build) { build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'mock' })); build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const useRouter=()=>({refresh(){}});', loader: 'js' })); } }] });
    const css = await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
    const item = { id: 'one', title: '기존 업무', owner: '비활성 직원', stakeholders: '', startDate: '', dueDate: '', description: '', completed: false, position: 0 };
    let changes = [], fail = false;
    server = http.createServer(async (req, res) => {
      if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles[0].text); }
      if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css.css); }
      if (req.url.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');
        if (req.url.includes('/status')) {
          let text = ''; for await (const chunk of req) text += chunk;
          const body = JSON.parse(text); changes.push(body.active);
          res.statusCode = fail ? 500 : 200; return res.end(JSON.stringify(fail ? { message: '저장 실패 테스트' } : body));
        }
        if (req.url === '/api/course-wbs') return res.end(JSON.stringify({ courses: [{ id: 'course', name: '테스트 강의', cohort: '', instructorName: '', webinarAt: null }], wbsSummaries: [], people: ['활성 직원', '비활성 직원', '활성 직원, 비활성 직원'], employeeNames: ['활성 직원', '비활성 직원'], inactivePeople: ['비활성 직원'], template: { id: 'template', name: '기본', items: [], updatedAt: null, builtIn: true } }));
        return res.end(JSON.stringify({ wbs: { courseId: 'course', items: [item], updatedAt: '2026-09-28' }, webinarAt: null }));
      }
      res.setHeader('Content-Type', 'text/html'); res.end('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const toggle = page.getByRole('switch');
    page.once('dialog', dialog => dialog.dismiss()); await toggle.click(); assert.deepEqual(changes, []);
    page.once('dialog', dialog => dialog.accept()); await toggle.click(); await page.getByText('비활성', { exact: true }).waitFor(); assert.equal(await toggle.isChecked(), false);
    await toggle.click(); await page.getByText('활성', { exact: true }).waitFor(); assert.deepEqual(changes, [false, true]);
    fail = true; page.once('dialog', dialog => dialog.accept()); await toggle.click(); await page.getByRole('alert').filter({ hasText: '저장 실패 테스트' }).waitFor(); assert.equal(await toggle.isChecked(), true);
    await page.getByRole('button', { name: '1번째 담당자 목록 열기', exact: true }).click();
    await page.getByRole('menuitem', { name: '활성 직원', exact: true }).waitFor();
    assert.equal(await page.getByRole('menuitem').filter({ hasText: '비활성 직원' }).count(), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('input').evaluateAll(inputs => inputs.some(input => input.value === '비활성 직원')), true);
    await fs.mkdir('.cache/account-status', { recursive: true });
    await page.screenshot({ path: '.cache/account-status/desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.cache/account-status/mobile.png' });
    console.log('PASS: confirmation cancel, deactivate, reactivate, failed save rollback, WBS suggestions exclude disabled names while preserving history');
  } finally { if (browser) await browser.close(); if (server) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
