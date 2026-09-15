/* eslint-disable @typescript-eslint/no-require-imports -- Local browser verification. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const esbuild = require('esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'C:/Users/resum/AppData/Local/Programs/Python/Python311/Lib/site-packages/playwright/driver/package');

(async () => {
  const directory = path.resolve('tmp/youtube-browser');
  await fs.mkdir(directory, { recursive: true });
  await esbuild.build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {YoutubeDownloader} from './src/components/tools/youtube-downloader'; createRoot(document.getElementById('root')).render(<YoutubeDownloader/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, outfile: path.join(directory, 'app.js'), platform: 'browser', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const javascript = await fs.readFile(path.join(directory, 'app.js'));
  let failures = false, polls = 0, preparations = 0;
  let browser;
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const json = (value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (request.url === '/app.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end(javascript); }
    else if (request.url === '/api/tools/youtube-download/info') json({ info: { id: 'jNQXAC9IVRw', title: '검증용 영상', channel: '테스트', duration: 12, thumbnail: '' } });
    else if (request.url === '/api/tools/youtube-download') { preparations++; polls = 0; setTimeout(() => json({ downloadUrl: '/file', statusUrl: '/status' }), 300); }
    else if (request.url === '/status') json(failures ? { status: 'error', error: '공개 영상 정보를 확인하지 못했습니다.' } : { status: ++polls < 2 ? 'processing' : 'ready' });
    else if (request.url === '/file') { response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="test.mp4"' }); response.end('test fixture'); }
    else { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<html><body><div id="root"></div><script src="/app.js"></script></body></html>'); }
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByLabel('유튜브 URL').fill('https://youtu.be/jNQXAC9IVRw');
    await page.getByRole('button', { name: '영상 확인' }).click();
    await page.getByText('검증용 영상', { exact: true }).waitFor();
    const download = page.getByRole('button', { name: '영상 다운로드', exact: true });
    assert.equal(await download.isDisabled(), true);
    await page.getByRole('checkbox').check();
    const received = page.waitForEvent('download');
    await download.click();
    await page.getByRole('status').filter({ hasText: '다운로드 환경을 준비' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '다운로드 준비 중' }).isDisabled(), true);
    assert.equal(await page.getByLabel('유튜브 URL').isDisabled(), true);
    const file = await received;
    assert.equal(file.suggestedFilename(), 'test.mp4');
    assert.equal(await file.failure(), null);
    await page.getByRole('status').filter({ hasText: '파일 저장을 시작' }).waitFor();
    failures = true;
    await download.click();
    await page.getByText('공개 영상 정보를 확인하지 못했습니다.', { exact: true }).waitFor();
    assert.equal(await download.isEnabled(), true);
    assert.equal(preparations, 2);
    assert.deepEqual(errors, []);
    console.log('PASS: consent, pending state, status polling, browser download and error recovery');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
