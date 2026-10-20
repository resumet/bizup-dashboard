import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pdfNodes, validatePdfFile, type PdfResult } from "./pdf";
import { richTextDocumentToBlocks, blocksToRichTextDocument } from "./rich-text";
import { courseDocumentContentSchema } from "./validation";

test("PDF 업로드는 확장자·MIME·크기를 검사한다", () => {
  assert.doesNotThrow(() => validatePdfFile({ name: "안내.PDF", type: "application/pdf", size: 1024 }));
  for (const file of [
    { name: "file.html", type: "application/pdf", size: 10 },
    { name: "file.pdf", type: "text/html", size: 10 },
    { name: "file.pdf", type: "application/pdf", size: 0 },
    { name: "file.pdf", type: "application/pdf", size: 50 * 1024 * 1024 + 1 },
  ]) assert.throws(() => validatePdfFile(file));
});

test("실제 PDF의 각 페이지가 이미지가 되어 저장·재접속 후에도 순서와 출처가 유지된다", () => {
  const python = process.env.PDF_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const converted = spawnSync(python, ["pdf-worker/test_convert.py", "--fixture-json"], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  assert.equal(converted.status, 0, converted.stderr);
  const result = JSON.parse(converted.stdout) as PdfResult;
  const job = "00000000-0000-4000-8000-000000000001";
  for (const block of result.blocks) {
    assert.equal(block.node.type, "image");
    block.node.attrs = { ...block.node.attrs, src: `https://app.test/api/course-document-pdfs/assets/${job}/p${block.source.page}-0.png` };
  }
  const nodes = pdfNodes(result, job);
  const blocks = courseDocumentContentSchema.parse(richTextDocumentToBlocks({ content: nodes }));
  const reopened = blocksToRichTextDocument(JSON.parse(JSON.stringify(blocks)));
  assert.equal(reopened.content.length, result.blocks.length);
  for (const [index, node] of reopened.content.entries()) {
    assert.equal(node.attrs?.sourcePage, result.blocks[index].source.page);
    assert.equal(node.attrs?.sourceJobId, job);
    assert.equal(node.attrs?.blockId, result.blocks[index].id);
    assert.equal(node.attrs?.extractionMethod, "render");
    assert.equal(node.type, "image");
  }
  assert.equal(reopened.content.length, result.pageCount);
});
