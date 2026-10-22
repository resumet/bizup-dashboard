import assert from "node:assert/strict";
import test from "node:test";

import {
  loadGoogleWorkbook,
  parsePublicGoogleSheetNames,
} from "./sheet-server";

const spreadsheetId = "12bXFG15XRwbAmxXREX7tWCUeSWtdOjO6lxwJk-YzKhY";

test("공개 Google Sheets HTML에서 탭 이름을 읽고 엔티티를 복원한다", () => {
  const html = [
    '<div class="goog-inline-block docs-sheet-tab-caption">성과 &amp; 요약</div>',
    '<div class="goog-inline-block docs-sheet-tab-caption">meta_raw</div>',
  ].join("");

  assert.deepEqual(parsePublicGoogleSheetNames(html), ["성과 & 요약", "meta_raw"]);
});

test("XLSX 내보내기가 401이면 공개 HTML과 GViz CSV로 모든 탭을 읽는다", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const requestedUrls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("/export?format=xlsx")) {
      return new Response("로그인이 필요합니다.", { status: 401 });
    }
    if (url.includes("/edit?usp=sharing")) {
      return new Response([
        '<div class="goog-inline-block docs-sheet-tab-caption">2611_사공</div>',
        '<div class="goog-inline-block docs-sheet-tab-caption">meta_raw</div>',
      ].join(""), { status: 200 });
    }
    if (url.includes("sheet=2611_%EC%82%AC%EA%B3%B5")) {
      return new Response('날짜,광고 노출\n,구글광고\n10월1일,"1,000"', { status: 200 });
    }
    if (url.includes("sheet=meta_raw")) {
      return new Response("캠페인,노출\n메타,500", { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };

  const workbook = await loadGoogleWorkbook(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit?usp=sharing`,
    "2026-10-01",
  );

  assert.deepEqual(workbook.sheets.map((sheet) => sheet.name), ["2611_사공", "meta_raw"]);
  assert.equal(workbook.sheets[0]?.rows[2]?.[1], "1,000");
  assert.equal(workbook.sheets[1]?.rows[1]?.[1], "500");
  assert.equal(requestedUrls.length, 4);
});
