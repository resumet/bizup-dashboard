/* eslint-disable @typescript-eslint/no-require-imports -- Browser verification harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let server, browser;
  try {
    const students = Array.from({ length: 100 }, (_, i) => ({ name: `수강생 ${i + 1}`, phone: '010-1234-5678', email: `student${i}@example.com`, className: '정산 검증 강의 / 심화반', paymentAmount: 1990000 }));
    const bundle = await esbuild.build({ stdin: { contents: `import {printStatementWithStudents} from './src/lib/course-settlements/print-students';window.runPrint=printStatementWithStudents;`, loader: 'ts', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser' });
    let fail = false;
    server = http.createServer((req, res) => {
      if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
      else if (req.url.startsWith('/api/')) { res.setHeader('Content-Type', 'application/json'); res.statusCode = fail ? 403 : 200; res.end(JSON.stringify(fail ? { message: '접근할 수 없습니다.' } : { students })); }
      else { res.setHeader('Content-Type', 'text/html'); res.end('<script src="/bundle.js"></script>'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch();
    const context = await browser.newContext();
    await context.addInitScript(() => { window.print = () => { window.printed = document.querySelectorAll('.student-table tbody tr').length; }; });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const opened = page.waitForEvent('popup');
    const pending = page.evaluate(() => window.runPrint('정산서', '<h1>정산내역서</h1><p>정산 본문</p>', 'test'));
    const popup = await opened;
    await pending;
    assert.equal(await popup.evaluate(() => window.printed), 100);
    assert.deepEqual(await popup.locator('.student-table th').allTextContents(), ['이름', '전화번호', '이메일', '신청한 클래스', '결제금액']);
    assert.equal(await popup.locator('.student-appendix').evaluate(el => getComputedStyle(el).breakBefore), 'page');
    await fs.mkdir('.cache/statement-students', { recursive: true });
    await popup.pdf({ path: '.cache/statement-students/statement.pdf', preferCSSPageSize: true });
    await popup.screenshot({ path: '.cache/statement-students/preview.png' });
    fail = true;
    const error = await page.evaluate(async () => { try { await window.runPrint('정산서', '', 'test'); } catch (error) { return error.message; } });
    assert.equal(error, '접근할 수 없습니다.');
    console.log('PASS: 100 students, all columns, page break, PDF output, fetch failure prevents print');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
