/* eslint-disable @typescript-eslint/no-require-imports -- Browser verification harness. */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

(async () => {
  let browser, server;
  try {
    browser = await chromium.launch({ headless: true });
    const source = await browser.newPage();
    await source.setContent('<h1>Receipt page one</h1><div style="break-before:page"><h1>Receipt page two</h1></div>');
    const pdf = await source.pdf({ format: 'A4' });
    await source.setContent('<div style="width:300px;height:200px;background:#22c55e">Image receipt</div>');
    const png = await source.locator('div').screenshot();
    const bundle = await esbuild.build({ stdin: { contents: `import {printStatementWithEvidence} from './src/lib/course-settlements/print-evidence';window.runPrint=printStatementWithEvidence;`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser' });
    server = http.createServer(async (req, res) => {
      if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); }
      else if (req.url.endsWith('pdf.worker.min.mjs')) { res.setHeader('Content-Type', 'text/javascript'); res.end(await fs.readFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')); }
      else if (req.url === '/receipt.pdf') { res.setHeader('Content-Type', 'application/pdf'); res.end(pdf); }
      else if (req.url === '/receipt.png') { setTimeout(() => { res.setHeader('Content-Type', 'image/png'); res.end(png); }, 300); }
      else if (req.url === '/missing.png') { res.statusCode = 404; res.end(); }
      else { res.setHeader('Content-Type', 'text/html'); res.end('<script type="module" src="/bundle.js"></script>'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const page = await browser.newPage();
    await page.context().addInitScript(() => { window.print = () => { window.printedImages = [...document.images].map(img => img.complete && img.naturalWidth > 0); }; });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.runPrint);
    const opened = page.waitForEvent('popup');
    const result = page.evaluate(() => window.runPrint('Settlement', '<h1>Settlement statement</h1>', [{ name: 'Expense', attachments: [
      { originalName: 'receipt.png', mimeType: 'image/png', url: '/receipt.png' },
      { originalName: 'receipt.pdf', mimeType: 'application/pdf', url: '/receipt.pdf' },
      { originalName: 'receipt.xlsx', mimeType: '', url: '/receipt.xlsx' },
    ] }]));
    const popup = await opened;
    await result;
    assert.deepEqual(await popup.evaluate(() => window.printedImages), [true, true, true]);
    assert.equal(await popup.locator('.evidence-page').count(), 4);
    await fs.mkdir('.cache/settlement-print', { recursive: true });
    await popup.pdf({ path: '.cache/settlement-print/statement.pdf', preferCSSPageSize: true });
    await popup.screenshot({ path: '.cache/settlement-print/statement.png', fullPage: true });
    const nonblank = await popup.locator('img').evaluateAll(images => images.map(img => {
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 100, 100);
      return new Set(ctx.getImageData(0, 0, 100, 100).data).size > 2;
    }));
    assert.deepEqual(nonblank, [true, true, true]);
    const error = await page.evaluate(async () => {
      try { await window.runPrint('Broken', '', [{ name: 'Expense', attachments: [{ originalName: 'missing.png', mimeType: 'image/png', url: '/missing.png' }] }]); }
      catch (error) { return error.message; }
    });
    assert.match(error, /missing.png/);
    console.log('PASS: image + multipage PDF, decoded/nonblank images, unsupported file notice, PDF output, missing file rejection');
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
