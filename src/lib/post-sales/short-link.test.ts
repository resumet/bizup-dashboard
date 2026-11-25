import assert from "node:assert/strict";
import test from "node:test";
import { syncPostSalesShortLink } from "./short-link";
import { ShortLinkError } from "@/lib/short-links/client";

const page = { courseId: "00000000-0000-4000-8000-000000000001", courseName: "Course", publicUrl: "https://example.com/public/post-sales/page" };
test("unpublished draft does not issue a link", async () => {
  assert.deepEqual(await syncPostSalesShortLink({ ...page, publicUrl: null }, async () => assert.fail(), async () => { assert.fail(); }), { shortUrl: null, shortLinkWarning: null });
});
test("new and existing aftersales URLs are persisted using the shared issuer", async () => {
  for (const existing of [false, true]) {
    let saved = "";
    const result = await syncPostSalesShortLink(page, async url => { saved = url; }, async input => {
      assert.equal(input.course_id, page.courseId);
      assert.equal(input.destination_url, page.publicUrl);
      assert.equal(input.type_key, "aftersales");
      return { short_url: "https://bizup.im/sales", existing };
    });
    assert.equal(saved, "https://bizup.im/sales");
    assert.equal(result.shortLinkWarning, null);
  }
});
test("issuance failure preserves old course link and lets saved revision reach the UI", async () => {
  const result = await syncPostSalesShortLink(page, async () => assert.fail(), async () => { throw new ShortLinkError("유형이 등록되지 않았습니다."); });
  assert.equal(result.shortUrl, null);
  assert.match(result.shortLinkWarning!, /페이지는 저장했습니다/);
  assert.match(result.shortLinkWarning!, /유형이 등록되지/);
});
test("DB failure is retryable and does not expose raw DB errors", async () => {
  const result = await syncPostSalesShortLink(page, async () => { throw new Error("private database detail"); }, async () => ({ short_url: "https://bizup.im/sales", existing: true }));
  assert.ok(result.shortLinkWarning);
  assert.ok(!result.shortLinkWarning.includes("private database detail"));
});
