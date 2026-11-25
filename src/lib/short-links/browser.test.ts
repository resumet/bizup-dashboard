import assert from "node:assert/strict";
import test from "node:test";
import { issueCourseShortLink } from "./browser";

test("shared browser gateway posts to the authenticated local endpoint for both QR types", async () => {
  for (const typeKey of ["landing", "payment"]) {
    const input = { course_id: "e226ccce-8d6c-47bf-92b8-0a8fe9c40cf3", type_key: typeKey, destination_url: `https://example.com/${typeKey}`, name: typeKey };
    const request: typeof fetch = async (url, options) => {
      assert.equal(url, `/api/course-operations/${input.course_id}/short-links`);
      assert.equal(new Headers(options?.headers).has("Authorization"), false);
      assert.deepEqual(JSON.parse(String(options?.body)), { type_key: typeKey, destination_url: input.destination_url, name: typeKey });
      return Response.json({ short_url: "https://bizup.im/result", existing: true });
    };
    assert.equal((await issueCourseShortLink(input, request)).existing, true);
  }
});

test("gateway rejects failed and malformed responses instead of overwriting fields", async () => {
  const input = { course_id: "e226ccce-8d6c-47bf-92b8-0a8fe9c40cf3", type_key: "landing", destination_url: "https://example.com", name: "Landing" };
  for (const response of [new Response("timeout", { status: 502 }), Response.json({}), Response.json({ short_url: "https://evil.test", existing: false })]) {
    await assert.rejects(issueCourseShortLink(input, async () => response));
  }
});
