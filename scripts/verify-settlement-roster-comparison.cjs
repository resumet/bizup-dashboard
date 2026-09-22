/* eslint-disable @typescript-eslint/no-require-imports -- Browser verification harness. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let server, browser;
  try {
    const order = (memberName, currentAmount = 100) => ({ id: memberName, memberName, currentAmount, paymentAmount: currentAmount, refundAmount: 0, phone: '', email: '', productName: '강의', optionName: '기본반', status: '결제완료', paymentMethod: '카드', orderId: '', paymentId: '' });
    const orders = ['일치', '주문전용', '금액차이'].map(name => order(name));
    const months = [{ fileName: '9월.xlsx', periodLabel: '2026년 9월', detailsByInstructor: { 강사: { toss: [['일치', 100], ['정산전용', 100], ['금액차이', 90]].map(([buyer, amount]) => ({ buyer, amount, date: '2026-09-22', status: '승인', paymentMethod: '카드' })), cash: [], service: [] } } }];
    const bundle = await esbuild.build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {RosterComparisonButton} from './src/components/course-settlements/roster-comparison-button';createRoot(document.getElementById('root')).render(<RosterComparisonButton courseId="test-course" courseName="검증 강의" instructor="강사" months={${JSON.stringify(months)}}/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic' });
    const css = await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
    let forbidden = false;
    server = http.createServer((req, res) => {
      if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
      else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); }
      else if (req.url === '/api/course-operations/test-course/orders') { res.setHeader('Content-Type', 'application/json'); res.statusCode = forbidden ? 403 : 200; res.end(JSON.stringify(forbidden ? { message: '주문 내역을 관리할 권한이 없습니다.' } : { orders, imports: [] })); }
      else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: '주문·정산 명단 비교' }).click();
    const popup = await popupPromise;
    popup.on('pageerror', error => errors.push(error.message));
    await popup.getByRole('heading', { name: '주문·정산 명단 비교' }).waitFor();
    assert.equal(await popup.locator('tbody tr').count(), 4);
    assert.equal(await popup.evaluate(() => window.opener), null);
    const colors = await popup.locator('tbody tr th').evaluateAll(cells => cells.map(cell => getComputedStyle(cell).backgroundColor));
    assert.equal(new Set(colors).size, 4);
    await popup.getByLabel('차이만 보기').check();
    assert.equal(await popup.locator('tbody tr:visible').count(), 3);
    await popup.getByLabel('비교 상태').selectOption('different');
    assert.equal(await popup.locator('tbody tr:visible').count(), 1);
    assert.equal(await popup.locator('tr.different .changed').count(), 4);
    await popup.getByLabel('원본 전체 펼치기').check();
    assert.ok(await popup.locator('details[open]').count() > 0);
    await popup.getByLabel('이름·연락처·원본 검색').fill('없는사람');
    await popup.getByText('해당하는 내역이 없습니다.').waitFor();
    await popup.getByLabel('이름·연락처·원본 검색').fill('');
    await popup.getByLabel('비교 상태').selectOption('all');
    await popup.getByLabel('차이만 보기').uncheck();
    await fs.mkdir('.cache/settlement-comparison', { recursive: true });
    await popup.setViewportSize({ width: 1440, height: 1000 });
    await popup.screenshot({ path: '.cache/settlement-comparison/desktop.png', fullPage: true });
    await popup.setViewportSize({ width: 390, height: 844 });
    assert.ok(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await popup.screenshot({ path: '.cache/settlement-comparison/mobile.png', fullPage: true });
    await popup.close();
    forbidden = true;
    const deniedPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: '주문·정산 명단 비교' }).click();
    const denied = await deniedPromise;
    await denied.getByText('주문 내역을 관리할 권한이 없습니다.').waitFor();
    await page.getByRole('alert').waitFor();
    await denied.close();
    await page.evaluate(() => { window.open = () => null; });
    await page.getByRole('button', { name: '주문·정산 명단 비교' }).click();
    await page.getByText('비교 창을 열 수 없습니다. 팝업을 허용해 주세요.').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: actual comparison button and popup; bidirectional differences, colors, source rows, search, filters, desktop/mobile, blocked popup and denied request. Orders API uses an isolated fixture.');
  } finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
