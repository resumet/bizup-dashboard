import assert from "node:assert/strict";
import test from "node:test";

import { printHtmlDocument } from "./print";

test("인쇄 창에 문서를 쓰고 브라우저 인쇄를 호출한다", () => {
  let html = "";
  let printed = false;
  const popup = {
    opener: {} as unknown,
    document: { open() {}, write(value: string) { html += value; }, close() {} },
    focus() {},
    print() { printed = true; },
    setTimeout(callback: () => void) { callback(); return 1; },
  };
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { open: () => popup } });
  try {
    printHtmlDocument("강사_정산표", "<h1>정산표</h1>");
    assert.match(html, /강사_정산표/u);
    assert.match(html, /<h1>정산표<\/h1>/u);
    assert.equal(printed, true);
    assert.equal(popup.opener, null);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});

test("팝업이 차단되면 사용자 안내 오류를 반환한다", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { open: () => null } });
  try {
    assert.throws(() => printHtmlDocument("정산표", ""), /팝업을 허용/u);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});
