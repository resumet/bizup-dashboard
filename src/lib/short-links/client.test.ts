import assert from "node:assert/strict";
import test from "node:test";
import { createShortLink } from "./client";

const input = { course_id: "e226ccce-8d6c-47bf-92b8-0a8fe9c40cf3", type: "0000", destination_url: "https://example.com/landing", name: "Landing" };
const loadKey = async () => "test-private-key";
test("201 sends the course UUID and zero-padded type using a server bearer key", async () => {
  const request: typeof fetch = async (url, options) => {
    assert.equal(url, "https://bizup.im/api/v1/short-links");
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-private-key");
    assert.deepEqual(JSON.parse(String(options?.body)), input);
    assert.equal(options?.redirect, "error");
    return Response.json({ short_url: "https://bizup.im/Ab3dE7x" }, { status: 201 });
  };
  assert.deepEqual(await createShortLink(input, { request, loadKey }), { short_url: "https://bizup.im/Ab3dE7x", existing: false });
});
test("409 LINK_TYPE_EXISTS reuses the existing short URL", async () => {
  const request: typeof fetch = async () => Response.json({ error: { code: "LINK_TYPE_EXISTS", details: { short_url: "https://bizup.im/existing" } } }, { status: 409 });
  assert.deepEqual(await createShortLink(input, { request, loadKey }), { short_url: "https://bizup.im/existing", existing: true });
});
test("invalid input and missing keys never call the provider", async () => {
  const request: typeof fetch = async () => { assert.fail("unexpected request"); };
  for (const invalid of [{ ...input, type: "12" }, { ...input, destination_url: "javascript:alert(1)" }, { ...input, course_id: "bad" }]) {
    await assert.rejects(createShortLink(invalid, { request, loadKey }));
  }
  await assert.rejects(createShortLink(input, { request, loadKey: async () => null }));
});
test("errors, malformed responses and timeouts never expose provider secrets", async () => {
  for (const response of [Response.json({ error: { code: "INVALID_API_KEY", message: "test-private-key" } }, { status: 401 }), new Response("not json", { status: 502 }), Response.json({ short_url: "https://evil.test/path" }, { status: 201 }), Response.json({ error: { code: "LINK_TYPE_EXISTS", details: {} } }, { status: 409 })]) {
    await assert.rejects(createShortLink(input, { request: async () => response, loadKey }), error => error instanceof Error && !error.message.includes("test-private-key"));
  }
  await assert.rejects(createShortLink(input, { request: async () => { throw new Error("test-private-key"); }, loadKey }), error => error instanceof Error && !error.message.includes("test-private-key"));
});
