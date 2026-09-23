/* eslint-disable @typescript-eslint/no-require-imports -- Browser verification harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let browser, server;
  try {
    const fixture = { id: 'dashboard', course: { id: 'course', name: '광고성과 검증', instructorName: '강사', startsAt: '' }, startDate: '2026-09-23', totalBudget: 10000000,
      organicChannels: [{ id: 'blog', name: '네이버 블로그', sortOrder: 0 }, { id: 'video', name: '유튜브', sortOrder: 1 }],
      metrics: [{ metricDate: '2026-09-23', googleImpressions: 1234567, metaImpressions: 30000, googleClicks: 100, metaClicks: 200, googleAdLeads: 10, metaAdLeads: 20, googleSpend: 123456789, metaSpend: 200000, googleLandingLeads: 30, metaLandingLeads: 40, adminCumulativeLeads: 100, organicLeads: { blog: 5, video: 7 } }] };
    const bundle = await esbuild.build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AdPerformanceDashboard} from './src/components/ad-performance/ad-performance-dashboard';const fixture=${JSON.stringify(fixture)};if(location.search){fixture.organicChannels=[];fixture.metrics[0].organicLeads={};}createRoot(document.getElementById('root')).render(<AdPerformanceDashboard initialData={fixture}/>);`, loader: 'tsx', resolveDir: process.cwd() }, define: { 'process.env': '{}' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic' });
    const css = await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), { from: path.resolve('src/app/globals.css') });
    server = http.createServer((req, res) => {
      if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
      else if (req.url === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); }
      else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script>'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    await page.locator('table[data-slot="table"]').waitFor();
    const presets = page.locator('details').filter({ hasText: '사전설정' });
    assert.equal(await presets.getAttribute('open'), '');
    assert.equal(await presets.getByLabel('광고시작일 설정').count(), 1);
    assert.equal(await presets.getByLabel('오가닉 채널 설정').count(), 1);
    await presets.getByLabel('총예산', { exact: true }).fill('12345678');
    await presets.locator('summary').click();
    assert.equal(await presets.getByLabel('광고시작일 설정').isVisible(), false);
    assert.equal(await page.getByRole('table', { name: '광고클릭전환율', exact: true }).isVisible(), true);
    await presets.locator('summary').press('Enter');
    assert.equal(await presets.getByLabel('총예산', { exact: true }).inputValue(), '12,345,678');
    assert.ok(await page.evaluate(() => {
      const settings = document.querySelector('details');
      const summary = document.querySelector('table[aria-label="광고클릭전환율"]');
      const input = document.querySelector('table[data-slot="table"]');
      return Boolean(settings.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING)
        && Boolean(summary.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING);
    }));
    const headers = await page.locator('table[data-slot="table"] thead tr').first().locator('th').allTextContents();
    const leftSummary = page.locator('[aria-label="광고비 및 전환율"]');
    const rightSummary = page.locator('[aria-label="DB 요약"]');
    assert.equal(await leftSummary.locator('[data-slot="card"]').count(), 4);
    assert.equal(await rightSummary.locator('[data-slot="card"]').count(), 4);
    assert.equal(await leftSummary.getByRole('table', { name: '광고클릭전환율', exact: true }).count(), 1);
    assert.equal(await leftSummary.getByRole('table', { name: '랜딩전환율', exact: true }).count(), 1);
    const leftBounds = await leftSummary.boundingBox();
    const rightBounds = await rightSummary.boundingBox();
    assert.ok(rightBounds.x >= leftBounds.x + leftBounds.width);
    assert.equal(leftBounds.y, rightBounds.y);
    const spendTable = page.getByRole('table', { name: '매체별 누적광고비', exact: true });
    assert.deepEqual(await spendTable.locator('th').allTextContents(), ['Google', 'Meta']);
    assert.deepEqual(await spendTable.locator('td').allTextContents(), ['₩123,456,789', '₩200,000']);
    assert.equal(await page.getByLabel('전체 누적광고비', { exact: true }).textContent(), '₩123,656,789');
    for (const label of ['광고클릭전환율', '랜딩전환율']) {
      const cardTable = page.getByRole('table', { name: label, exact: true });
      assert.deepEqual(await cardTable.locator('th').allTextContents(), ['Google', 'Meta']);
      assert.equal(await cardTable.locator('td').count(), 2);
    }
    assert.deepEqual(await page.getByRole('table', { name: '랜딩전환율', exact: true }).locator('td').allTextContents(), ['10%', '10%']);
    assert.equal(await page.getByRole('columnheader', { name: '랜딩페이지접수 DB', exact: true }).getAttribute('colspan'), '3');
    assert.deepEqual((await page.locator('table[data-slot="table"] thead tr').nth(1).locator('th').allTextContents()).slice(10, 13), ['Google', 'Meta', '총합']);
    const standardTextSize = await page.evaluate(() => `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.875}px`);
    assert.equal(await page.locator('table[data-slot="table"]').evaluate(el => getComputedStyle(el).fontSize), standardTextSize);
    assert.equal(await page.getByLabel('2026-09-23 Google 광고 노출', { exact: true }).evaluate(el => getComputedStyle(el).fontSize), standardTextSize);
    assert.equal(await page.getByRole('columnheader', { name: '오가닉 채널 DB', exact: true }).getAttribute('colspan'), '3');
    assert.deepEqual((await page.locator('table[data-slot="table"] thead tr').nth(1).locator('th').allTextContents()).slice(13, 16), ['네이버 블로그', '유튜브', '총합']);
    assert.equal(headers[headers.indexOf('오가닉 채널 DB') + 1], 'DB 총합');
    assert.equal(await page.getByRole('columnheader', { name: 'DB 총합', exact: true }).getAttribute('rowspan'), '2');
    for (const label of ['클릭전환', '랜딩전환']) {
      assert.equal(await page.getByRole('columnheader', { name: label, exact: true }).getAttribute('colspan'), '2');
    }
    assert.deepEqual((await page.locator('table[data-slot="table"] thead tr').nth(1).locator('th').allTextContents()).slice(-4), ['Google', 'Meta', 'Google', 'Meta']);
    const cells = page.locator('table[data-slot="table"] tbody tr').first().locator('td');
    assert.deepEqual(headers.slice(-3, -1), ['광고DB당 단가', '랜딩DB당 단가']);
    assert.deepEqual((await cells.allTextContents()).slice(-5, -1), ['₩12,345,679', '₩10,000', '₩4,115,226', '₩5,000']);
    assert.equal(await page.getByRole('columnheader', { name: '광고 집행비용', exact: true }).getAttribute('colspan'), '4');
    assert.deepEqual((await page.locator('table[data-slot="table"] thead tr').nth(1).locator('th').allTextContents()).slice(6, 10), ['Google', 'Meta', '총광고비', '누적총광고비']);
    assert.equal(await cells.nth(9).textContent(), '123,656,789');
    assert.equal(await cells.nth(10).textContent(), '123,656,789');
    assert.equal(await cells.nth(13).textContent(), '70');
    assert.equal(await cells.nth(16).textContent(), '12');
    assert.equal(await cells.nth(17).textContent(), '82');
    await page.getByLabel('2026-09-23 Google 랜딩페이지접수 DB', { exact: true }).fill('50');
    assert.equal(await cells.nth(13).textContent(), '90');
    assert.equal(await cells.nth(17).textContent(), '102');
    const width = await page.locator('table[data-slot="table"]').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(width < 2800, `Table should be compact: ${width}`);
    await fs.mkdir('.cache/ad-performance-table', { recursive: true });
    await page.getByRole('region', { name: '성과 요약', exact: true }).screenshot({ path: '.cache/ad-performance-table/summary-desktop.png' });
    await presets.screenshot({ path: '.cache/ad-performance-table/presets-desktop.png' });
    await spendTable.locator('..').screenshot({ path: '.cache/ad-performance-table/spend-desktop.png' });
    await page.getByRole('table', { name: '광고클릭전환율', exact: true }).screenshot({ path: '.cache/ad-performance-table/conversion-desktop.png' });
    await page.setViewportSize({ width: 2100, height: 1000 });
    await page.locator('table[data-slot="table"]').screenshot({ path: '.cache/ad-performance-table/desktop.png' });
    await page.locator('[data-slot="table-container"]').evaluate(el => { el.scrollLeft = el.scrollWidth; });
    await page.locator('[data-slot="table-container"]').screenshot({ path: '.cache/ad-performance-table/unit-costs.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileLeft = await leftSummary.boundingBox();
    const mobileRight = await rightSummary.boundingBox();
    assert.ok(mobileRight.y >= mobileLeft.y + mobileLeft.height);
    await presets.screenshot({ path: '.cache/ad-performance-table/presets-mobile.png' });
    await spendTable.locator('..').screenshot({ path: '.cache/ad-performance-table/spend-mobile.png' });
    await page.getByRole('table', { name: '랜딩전환율', exact: true }).screenshot({ path: '.cache/ad-performance-table/conversion-mobile.png' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('table[data-slot="table"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.cache/ad-performance-table/mobile.png' });
    await page.getByLabel('기록 날짜', { exact: true }).fill('2026-09-25');
    await page.getByRole('button', { name: '날짜 추가', exact: true }).click();
    await page.getByLabel('2026-09-25 Google 광고 집행비용', { exact: true }).fill('300');
    await page.getByLabel('2026-09-25 Meta 광고 집행비용', { exact: true }).fill('200');
    const secondCells = page.locator('table[data-slot="table"] tbody tr').nth(1).locator('td');
    assert.equal(await secondCells.nth(9).textContent(), '500');
    assert.deepEqual((await secondCells.allTextContents()).slice(-5, -1), ['-', '-', '-', '-']);
    assert.equal(await secondCells.nth(10).textContent(), '123,657,289');
    await page.getByLabel('2026-09-23 Google 광고 집행비용', { exact: true }).fill('100');
    await page.getByLabel('2026-09-23 Meta 광고 집행비용', { exact: true }).fill('200');
    assert.equal(await cells.nth(10).textContent(), '300');
    assert.deepEqual((await cells.allTextContents()).slice(-5, -1), ['₩10', '₩10', '₩2', '₩5']);
    assert.equal(await secondCells.nth(10).textContent(), '800');
    assert.deepEqual(await spendTable.locator('td').allTextContents(), ['₩400', '₩400']);
    assert.equal(await page.getByLabel('전체 누적광고비', { exact: true }).textContent(), '₩800');
    await page.getByRole('button', { name: '2026-09-25 삭제', exact: true }).click();
    assert.equal(await page.locator('table[data-slot="table"] tbody tr').count(), 1);
    assert.equal(await cells.nth(10).textContent(), '300');
    await page.goto(`${url}/?empty`);
    await page.locator('table[data-slot="table"]').waitFor();
    assert.equal(await page.locator('table[data-slot="table"] tbody tr td').nth(15).textContent(), '0');
    assert.deepEqual(errors, []);
    console.log(`PASS: adjacent totals, live calculation, zero-channel layout, desktop/mobile scrolling; table width ${width}px (previous minimum 2810px)`);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
