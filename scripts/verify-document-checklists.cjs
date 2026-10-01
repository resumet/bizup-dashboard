/* eslint-disable @typescript-eslint/no-require-imports -- Real editor browser regression harness. */
// Run: node scripts/verify-document-checklists.cjs
// Requires Playwright with Chromium installed. Set PLAYWRIGHT_PACKAGE_PATH when
// using an existing Playwright installation outside this repository.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const esbuild = require('esbuild');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || 'playwright');

// All documents and saves are isolated fixtures served on loopback. No application DB is used.
const emptyDocument = {
  id: '11111111-1111-4111-8111-111111111111',
  courseId: '22222222-2222-4222-8222-222222222222',
  instructorName: '검증 강사', title: '체크 항목 검증', slug: 'checklist-test',
  status: 'draft', leadGateEnabled: false, leadGateAfterBlockId: null,
  leadCount: 0, createdAt: '2026-10-02T00:00:00Z', updatedAt: '2026-10-02T00:00:00Z',
  publishedAt: null, content: [],
};

async function assertAligned(page, label) {
  const items = await page.locator('.course-rich-text-editor li').evaluateAll(nodes =>
    nodes.filter(node => node.querySelector(':scope > label > input[type="checkbox"]')).map(node => {
      const checkbox = node.querySelector(':scope > label > input').getBoundingClientRect();
      const paragraph = node.querySelector(':scope > div > p');
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const firstLine = range.getClientRects()[0] || paragraph.getBoundingClientRect();
      return {
        type: node.getAttribute('data-type'), display: getComputedStyle(node).display,
        checkbox: { left: checkbox.left, right: checkbox.right, top: checkbox.top, bottom: checkbox.bottom },
        firstLine: { left: firstLine.left, top: firstLine.top, bottom: firstLine.bottom },
      };
    }),
  );
  assert.ok(items.length > 0, `${label}: no checklist items`);
  for (const item of items) {
    assert.ok(
      item.firstLine.left >= item.checkbox.right &&
      item.firstLine.top < item.checkbox.bottom &&
      item.firstLine.bottom > item.checkbox.top,
      `${label}: checkbox and text are not on the same line: ${JSON.stringify(item)}`,
    );
  }
  return items.length;
}

(async () => {
  let browser, server;
  let saved = structuredClone(emptyDocument);
  const output = path.resolve('tmp/document-checklists');
  await fs.mkdir(output, { recursive: true });
  console.log('Bundling the actual document editor...');
  const bundle = await esbuild.build({
    stdin: {
      contents: `import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {CourseDocumentEditor} from './src/components/course-documents/document-editor';
        const doc = await fetch('/fixture.json').then(response => response.json());
        const mode = new URLSearchParams(location.search).get('mode') || 'admin';
        createRoot(document.getElementById('root')).render(<CourseDocumentEditor
          mode={mode} courseId={doc.courseId} courseName="검증용 강의"
          accessToken="local-fixture" document={doc} fixedTitle />);`,
      loader: 'tsx', resolveDir: process.cwd(),
    },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic',
  });
  console.log('Compiling application CSS...');
  const css = await postcss([tailwind()]).process(await fs.readFile('src/app/globals.css', 'utf8'), {
    from: path.resolve('src/app/globals.css'),
  });
  try {
    server = http.createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const send = (contentType, value) => { res.setHeader('Content-Type', contentType); res.end(value); };
      if (req.url === '/bundle.js') send('text/javascript', bundle.outputFiles[0].text);
      else if (req.url === '/style.css') send('text/css', css.css);
      else if (req.url === '/fixture.json') send('application/json', JSON.stringify(saved));
      else if (req.url.startsWith('/api/')) {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const payload = JSON.parse(raw);
        saved = { ...saved, ...(payload.document || payload) };
        send('application/json', JSON.stringify({ id: saved.id }));
      } else {
        send('text/html; charset=utf-8', '<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>');
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    console.log('Launching Chromium...');
    browser = await chromium.launch({ headless: true });
    for (const mode of ['admin', 'external']) {
      for (const width of [1440, 390]) {
        saved = structuredClone(emptyDocument);
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        const errors = [];
        page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
        page.on('dialog', dialog => dialog.accept());
        const label = `${mode}-${width}`;
        await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
        await page.locator('.course-rich-text-editor').waitFor();
        await page.getByRole('button', { name: '체크 항목 넣기', exact: true }).click();
        await page.keyboard.insertText('체크박스와 같은 줄에 표시되는 항목');
        await page.locator('.course-rich-text-editor').screenshot({ path: path.join(output, `${label}-new.png`) });
        await assertAligned(page, `${label} new item`);
        await page.keyboard.press('End');
        await page.keyboard.insertText(' 긴 내용도 체크박스 오른쪽에서 자연스럽게 줄바꿈되어야 합니다.'.repeat(4));
        await assertAligned(page, `${label} wrapped text`);
        await page.keyboard.press('Enter');
        await page.keyboard.insertText('두 번째 항목');
        assert.equal(await assertAligned(page, `${label} Enter`), 2);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('ul[data-type="taskList"] ul[data-type="taskList"]').count(), 1);
        await assertAligned(page, `${label} nested`);
        const checkbox = page.locator('.course-rich-text-editor input[type="checkbox"]').first();
        await checkbox.check();
        assert.equal(await checkbox.isChecked(), true);
        await assertAligned(page, `${label} checked update`);
        await page.getByRole('button', { name: '저장', exact: true }).click();
        await page.getByText('저장했습니다.', { exact: true }).waitFor();
        assert.ok(JSON.stringify(saved.content).includes('"checked":true'));
        assert.ok(JSON.stringify(saved.content).includes('두 번째 항목'));
        await page.reload();
        await page.locator('.course-rich-text-editor input[type="checkbox"]').first().waitFor();
        assert.equal(await page.locator('.course-rich-text-editor input[type="checkbox"]').first().isChecked(), true);
        assert.equal(await assertAligned(page, `${label} saved/reopened`), 2);
        await page.locator('.course-rich-text-editor').screenshot({ path: path.join(output, `${label}-reopened.png`) });
        await page.getByRole('button', { name: '미리보기', exact: true }).click();
        assert.equal(await page.locator('input[type="checkbox"]').count(), 2);
        await page.getByRole('button', { name: '편집', exact: true }).click();
        await assertAligned(page, `${label} return from preview`);
        assert.deepEqual(errors, []);
        console.log(`PASS ${label}: new, wrapped, Enter, nested, checked, saved/reopened, preview`);
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    if (server?.listening) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
