/* eslint-disable @typescript-eslint/no-require-imports -- Browser regression harness. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let server, browser;
  try {
    const bundle = await esbuild.build({ stdin: { contents: `
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {CourseSettlementManager} from './src/components/course-settlements/course-settlement-manager';
      import {ManualEnrollmentDialog} from './src/components/jobs/manual-enrollment-dialog';
      import {PaymentMethodBadge} from './src/components/jobs/payment-method';
      createRoot(document.getElementById('root')).render(<main className="p-4 space-y-4">
        <ManualEnrollmentDialog jobId="job" courseName="검증 강의" paidRoster onAdded={() => location.reload()} />
        <div id="badges">{['신용카드','현금결제','가상계좌','간편결제'].map(value => <PaymentMethodBadge key={value} value={value}/>)}</div>
        <CourseSettlementManager courseId="course" courseName="검증 강의" instructorName="강사" />
      </main>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' } });
    const css = await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: 'src/app/globals.css' });
    const result = { instructor: '강사', totalSales: 1000000, pgFee: 30000, systemNovaFee: 20000, additionalServiceFee: 50000, finalSettlement: 900000, tossSales: 1000000, cashSales: 0, settlementAmount: 900000 };
    const instructor = { ...result, monthlySettlements: [{ fileName: 'test.xlsx', periodLabel: '2026-10', result }] };
    const month = { fileName: 'test.xlsx', periodLabel: '2026-10', instructorResults: [result], totals: result, comparisons: [], allMatched: true, detailsByInstructor: { 강사: { toss: [], cash: [], service: [] } } };
    const state = { settlementId: 'settlement', status: '분석완료', latestVersion: 1, updatedAt: '', uploads: [], attachments: [], courseCosts: [], appliedCourseCosts: [], costsAreSnapshot: false,
      manualCash: { payerCount: 0, paymentCount: 0, amount: 0 }, draft: { lectureName: '검증 강의', coursePeriod: '2026-10', settlementPeriod: '2026-10', manager: '담당자' },
      analysis: { engineVersion: 'test', monthlyAnalyses: [month], instructorResults: [instructor], totals: result, matchedCount: 0, comparisonCount: 0, allMatched: true } };
    let saved;
    server = http.createServer(async (req, res) => {
      if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
      else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); }
      else if (req.url === '/api/jobs/job/enrollments') {
        let body = ''; for await (const chunk of req) body += chunk;
        saved = JSON.parse(body);
        state.manualCash = { payerCount: 1, paymentCount: 1, amount: Number(saved.paymentAmount.replaceAll(',', '')) };
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ enrollment: { id: 'manual' } }));
      } else if (req.url.startsWith('/api/course-settlements')) {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ state }));
      } else if (req.url.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ students: [] }));
      } else { res.setHeader('Content-Type', 'text/html'); res.end('<meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
    await page.context().addInitScript(() => { window.print = () => {}; });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByText('누적 최종 정산금', { exact: true }).waitFor().catch(async error => { console.error(await page.locator('body').innerText()); throw error; });
    const cashCard = page.locator('p').filter({ hasText: /^현금결제$/ });
    assert.equal(await cashCard.count(), 0);
    const colors = await page.locator('#badges span').evaluateAll(items => items.map(item => getComputedStyle(item).backgroundColor));
    assert.equal(new Set(colors).size, 4);
    await page.getByRole('button', { name: /수동 추가/ }).click();
    await page.getByLabel('이름', { exact: true }).fill('현금 수강생');
    await page.getByLabel('연락처', { exact: true }).fill('01012345678');
    await page.getByLabel('결제방법', { exact: true }).selectOption('현금결제');
    await page.getByLabel('결제금액', { exact: true }).fill('200000');
    await page.locator('button[type=submit]').click();
    await page.getByText('누적 최종 정산금', { exact: true }).waitFor();
    assert.equal(saved.paymentMethod, '현금결제');
    await page.getByText('1명 · 수동 추가', { exact: true }).waitFor();
    assert.match(await page.getByText('누적 최종 정산금', { exact: true }).locator('..').textContent(), /1,100,000원/);
    await page.getByRole('button', { name: '최종 정산하기', exact: true }).click();
    const target = page.getByRole('row').filter({ has: page.getByText('정산대상 매출', { exact: true }) });
    assert.match(await target.textContent(), /1,100,000원.*A − B − C − C1/);
    assert.match(await page.getByRole('row').filter({ has: page.getByText('현금결제 매출', { exact: true }) }).textContent(), /200,000원/);
    assert.match(await page.getByRole('row').filter({ has: page.getByText('최종 강사 지급액', { exact: true }) }).textContent(), /605,000원/);
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /PDF|인쇄/ }).last().click();
    const popup = await popupPromise;
    await popup.getByText('정산대상 매출', { exact: true }).waitFor();
    assert.match(await popup.locator('body').textContent(), /A − B − C − C1/);
    await fs.mkdir('tmp/manual-cash-settlement', { recursive: true });
    await page.screenshot({ path: 'tmp/manual-cash-settlement/desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: 'tmp/manual-cash-settlement/mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: payment dropdown/save, four badge colors, conditional cash card, settlement arithmetic, print formula, mobile layout');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
