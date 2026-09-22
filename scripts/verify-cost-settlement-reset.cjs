/* eslint-disable @typescript-eslint/no-require-imports -- Browser verification harness. */
const assert = require('node:assert/strict');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let browser, server;
  try {
    const costs = ['cost-a', 'cost-b'].map(id => ({ id, categoryCode: 'CUSTOM', name: id, burdenType: 'COMPANY', managerName: 'Manager', grossAmount: 110, paidDate: '2026-09-22', status: 'PAID', companyShareRate: 100, instructorShareRate: 0, version: 1, attachments: [] }));
    const bundle = await esbuild.build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CourseCostManager} from './src/components/course-costs/course-cost-manager';createRoot(document.getElementById('root')).render(<CourseCostManager courseId="course"/>);`, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic' });
    let saved = null;
    server = http.createServer(async (req, res) => {
      if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
      else if (req.url.startsWith('/api/')) {
        if (req.method === 'PUT') {
          let input = ''; for await (const chunk of req) input += chunk;
          saved = JSON.parse(input);
          costs[0] = { ...costs[0], ...saved.updates[0].input, version: 2 };
        }
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ costs, locked: !saved }));
      } else { res.setHeader('Content-Type', 'text/html'); res.end('<div id="root"></div><script src="/bundle.js"></script>'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const save = page.getByRole('button', { name: '비용 변경사항 저장' }).first();
    await save.waitFor();
    assert.equal(await save.isDisabled(), true);
    await page.locator('input').filter({ visible: true }).first().fill('Changed cost');
    assert.equal(await save.isEnabled(), true);
    page.once('dialog', dialog => dialog.dismiss());
    await save.click();
    assert.equal(saved, null);
    page.once('dialog', dialog => dialog.accept());
    await save.click();
    await page.getByText(/기존 정산 결과를 초기화했습니다/).waitFor();
    assert.equal(saved.updates.length, 1);
    assert.equal(saved.updates[0].id, 'cost-a');
    assert.equal(await save.isDisabled(), true);
    console.log('PASS: confirmed cost editing, dirty save activation, cancel, only changed rows saved, disabled after save');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
