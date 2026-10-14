/* eslint-disable @typescript-eslint/no-require-imports -- Browser verification harness. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { build } = require("esbuild");
const readXlsxFile = require("read-excel-file/node").default;
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE_PATH || "playwright");

(async () => {
  let browser, server;
  try {
    const row = ["10월 14일", "300,000원", "1000", "2000", "50", "100", "5%", "0.05", "20%", "0.2", "100000", "200000", "10", "20", "5", "10"];
    const state = {
      spreadsheetUrl: "", spreadsheetId: "example", sheetName: "검증 강의",
      sourceRows: [["일자", "총광고비"], ["", "300000"], ...Array.from({ length: 105 }, () => row)],
      tracking: null, trackingFileName: null, manualInputs: {}, version: 1, updatedAt: "",
    };
    const bundle = await build({
      stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {MeaningSheetWorkspace} from './src/components/admin/meaning-sheet-workspace';
        const state=${JSON.stringify(state)};function Test(){const [toolbar,setToolbar]=useState(null);const empty=location.search.includes('empty');return <><div ref={setToolbar}/><MeaningSheetWorkspace dashboardId="test" dashboardStartDate="2026-10-01" sheetState={empty?null:state} toolbarContainer={toolbar}/></>};createRoot(document.getElementById('root')).render(<Test/>);`,
        resolveDir: process.cwd(), loader: "tsx" },
      define: { "process.env": "{}" }, bundle: true, write: false, platform: "browser", jsx: "automatic",
      plugins: [{ name: "router-fixture", setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "fixture" }));
        b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "const router={refresh(){}};export function useRouter(){return router}" }));
      } }],
    });
    server = http.createServer((req, res) => {
      if (req.url.startsWith("/api/")) {
        res.setHeader("Content-Type", "application/json"); res.end('{"version":1}'); return;
      }
      res.setHeader("Content-Type", req.url === "/bundle.js" ? "text/javascript" : "text/html; charset=utf-8");
      res.end(req.url === "/bundle.js" ? bundle.outputFiles[0].text : '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/bundle.js"></script></html>');
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge", headless: true });
    const page = await browser.newPage();
    const errors = [], writes = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error(error.message); });
    page.on("request", (request) => { if (request.method() !== "GET") writes.push(request.url()); });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    const button = page.getByRole("button", { name: "엑셀 다운로드", exact: true });
    await button.waitFor();
    assert.equal(await button.isEnabled(), true);
    assert.equal(await page.locator("tbody tr").count(), 100);
    const downloadPromise = page.waitForEvent("download");
    await button.click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^검증 강의_광고지표_\d{4}-\d{2}-\d{2}\.xlsx$/u);
    const output = path.resolve(".cache/ad-performance-export/download.xlsx");
    await fs.mkdir(path.dirname(output), { recursive: true });
    await download.saveAs(output);
    const [sheet] = await readXlsxFile(output);
    assert.equal(sheet.data.length, 107);
    assert.deepEqual(sheet.data.at(-1).slice(14, 19), [5, 10, 15, 0, 15]);
    assert.equal(sheet.data[2][6], 0.05);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    assert.equal(await page.locator("tbody tr").count(), 5);
    const secondDownload = page.waitForEvent("download");
    await button.click();
    await (await secondDownload).saveAs(output);
    assert.equal((await readXlsxFile(output))[0].data.length, 107);

    await page.evaluate(() => { window.originalCreateObjectURL = URL.createObjectURL; URL.createObjectURL = () => { throw new Error("다운로드 검증 오류"); }; });
    await button.click();
    await page.getByText("다운로드 검증 오류", { exact: true }).waitFor();
    assert.equal(await button.isEnabled(), true);
    await page.evaluate(() => { URL.createObjectURL = window.originalCreateObjectURL; });
    const retry = page.waitForEvent("download");
    await button.click();
    await retry;
    assert.equal(await page.getByText("다운로드 검증 오류", { exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await button.isVisible(), true);
    await page.goto(`${url}?empty`);
    await button.waitFor();
    assert.equal(await button.isDisabled(), true);
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    console.log("PASS: full XLSX download from both pages, numeric values, retry, empty state, mobile button, no writes or browser errors");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server ? server.close(resolve) : resolve());
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
