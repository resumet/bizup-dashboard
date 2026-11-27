import assert from "node:assert/strict";
import test from "node:test";
import { createShortLink } from "./client";
import { shortLinkInputSchema } from "./model";
import { CHAT_SHORT_LINKS, type ChatShortLinkField } from "./types";

const input = { course_id: "e226ccce-8d6c-47bf-92b8-0a8fe9c40cf3", type_key: "landing", destination_url: "https://example.com/landing", name: "Landing" };
const loadKey = async () => "test-private-key";
const types = [{ key: "landing", label: "Landing", active: true }, { key: "payment", label: "Payment", active: true }];
function withTypes(request: typeof fetch, list = types): typeof fetch {
  return async (url, options) => String(url).endsWith("/short-link-types") ? Response.json({ types: list }) : request(url, options);
}
test("201 looks up server types and sends type_key with server bearer key", async () => {
  let lookedUp = false;
  const request: typeof fetch = async (url, options) => {
    assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer test-private-key");
    if (String(url).endsWith("/short-link-types")) { lookedUp = true; assert.equal(options?.method, "GET"); return Response.json({ types }); }
    assert.ok(lookedUp);
    assert.equal(url, "https://bizup.im/api/v1/short-links");
    assert.deepEqual(JSON.parse(String(options?.body)), input);
    assert.equal(options?.redirect, "error");
    return Response.json({ short_url: "https://bizup.im/Ab3dE7x" }, { status: 201 });
  };
  assert.deepEqual(await createShortLink(input, { request, loadKey }), { short_url: "https://bizup.im/Ab3dE7x", existing: false });
});
test("409 LINK_TYPE_EXISTS reuses the existing short URL", async () => {
  const request: typeof fetch = async () => Response.json({ error: { code: "LINK_TYPE_EXISTS", details: { short_url: "https://bizup.im/existing" } } }, { status: 409 });
  assert.deepEqual(await createShortLink(input, { request: withTypes(request), loadKey }), { short_url: "https://bizup.im/existing", existing: true });
});
test("invalid input and missing keys never call the provider", async () => {
  const request: typeof fetch = async () => { assert.fail("unexpected request"); };
  for (const invalid of [{ ...input, type: "0001" }, { ...input, type_key: "0001" }, { ...input, type_key: "Payment" }, { ...input, destination_url: "javascript:alert(1)" }, { ...input, course_id: "bad" }]) {
    await assert.rejects(createShortLink(invalid, { request, loadKey }));
  }
  await assert.rejects(createShortLink(input, { request, loadKey: async () => null }));
});
test("errors, malformed responses and timeouts never expose provider secrets", async () => {
  for (const response of [Response.json({ error: { code: "INVALID_API_KEY", message: "test-private-key" } }, { status: 401 }), new Response("not json", { status: 502 }), Response.json({ short_url: "https://evil.test/path" }, { status: 201 }), Response.json({ error: { code: "LINK_TYPE_EXISTS", details: {} } }, { status: 409 })]) {
    await assert.rejects(createShortLink(input, { request: withTypes(async () => response), loadKey }), error => error instanceof Error && !error.message.includes("test-private-key"));
  }
  await assert.rejects(createShortLink(input, { request: async () => { throw new Error("test-private-key"); }, loadKey }), error => error instanceof Error && !error.message.includes("test-private-key"));
});

test("failed, malformed or missing type lists prevent issuance", async () => {
  for (const response of [new Response("down", { status: 503 }), Response.json({ types: [] }), Response.json({ types: [{ key: "landing" }] })]) {
    const request: typeof fetch = async (url) => {
      assert.ok(String(url).endsWith("/short-link-types"));
      return response;
    };
    await assert.rejects(createShortLink(input, { request, loadKey }));
  }
});

test("inactive type may reuse existing link; otherwise surfaces provider inactive error", async () => {
  const inactive = types.map(item => ({ ...item, active: false }));
  const request: typeof fetch = async () => Response.json({ error: { code: "LINK_TYPE_EXISTS", details: { short_url: "https://bizup.im/old" } } }, { status: 409 });
  assert.equal((await createShortLink(input, { request: withTypes(request, inactive), loadKey })).existing, true);
  await assert.rejects(createShortLink(input, { request: withTypes(async () => Response.json({ error: { code: "LINK_TYPE_INACTIVE" } }, { status: 422 }), inactive), loadKey }), /비활성화/);
});

test("new server types need no local enum and old type-only bodies are rejected", async () => {
  const custom = { key: "inquiry", label: "Inquiry", active: true };
  const request: typeof fetch = async (_url, options) => {
    assert.equal(JSON.parse(String(options?.body)).type_key, "inquiry");
    return Response.json({ short_url: "https://bizup.im/new" }, { status: 201 });
  };
  await createShortLink({ ...input, type_key: "inquiry" }, { request: withTypes(request, [custom]), loadKey });
  const { type_key: _key, ...old } = input;
  void _key;
  assert.equal(shortLinkInputSchema.safeParse({ ...old, type: "0000" }).success, false);
});

test("each free chat room issues only its own active registered type", async () => {
  for (const field of Object.keys(CHAT_SHORT_LINKS) as ChatShortLinkField[]) {
    const label = CHAT_SHORT_LINKS[field].label;
    const registered = { key: "operator_assigned", label, active: true };
    const chat = { field, course_id: input.course_id, destination_url: input.destination_url, name: label };
    const issue: typeof fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      assert.equal(body.type_key, registered.key);
      assert.equal(body.destination_url, chat.destination_url);
      assert.equal(body.field, undefined);
      return Response.json({ short_url: "https://bizup.im/room" }, { status: 201 });
    };
    assert.equal((await createShortLink(chat, { request: withTypes(issue, [registered]), loadKey })).short_url, "https://bizup.im/room");
    for (const registry of [types, [{ ...registered, active: false }], [{ ...registered, key: "landing" }], [registered, { ...registered, key: "duplicate" }]]) {
      await assert.rejects(createShortLink(chat, { request: withTypes(issue, registry), loadKey }), /전용 유형/);
    }
    await assert.rejects(createShortLink({ ...input, type_key: registered.key }, { request: withTypes(issue, [registered]), loadKey }), /단축주소 발급 버튼/);
  }
});
