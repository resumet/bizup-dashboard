import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFormat, evidencePage, waitForPrintImages } from "./print-evidence";

test("evidence formats include images and PDF, but not spreadsheets", () => {
  assert.equal(evidenceFormat("receipt.PNG", ""), "image");
  assert.equal(evidenceFormat("receipt", "image/jpeg"), "image");
  assert.equal(evidenceFormat("receipt.PDF", "application/octet-stream"), "pdf");
  assert.equal(evidenceFormat("receipt.xlsx", ""), "unsupported");
});

test("appendix escapes labels and identifies unsupported attachments", () => {
  const html = evidencePage('<cost>', '"receipt"', "blob:receipt", 2);
  assert.match(html, /&lt;cost&gt;/);
  assert.match(html, /&quot;receipt&quot;/);
  assert.match(html, /2페이지/);
  assert.match(html, /<img/);
  assert.match(evidencePage("cost", "receipt.xlsx"), /지원되지 않습니다/);
});

test("printing waits for every image to decode", async () => {
  let resolveImage!: () => void;
  let ready = false;
  const image = new Promise<void>((resolve) => { resolveImage = resolve; });
  const document = { images: [{ decode: () => image }], fonts: { ready: Promise.resolve() } } as unknown as Document;
  const pending = waitForPrintImages(document).then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  resolveImage();
  await pending;
  assert.equal(ready, true);
});

test("a broken image prevents printing", async () => {
  const document = { images: [{ decode: () => Promise.reject(new Error("broken image")) }], fonts: { ready: Promise.resolve() } } as unknown as Document;
  await assert.rejects(waitForPrintImages(document), /broken image/);
});
