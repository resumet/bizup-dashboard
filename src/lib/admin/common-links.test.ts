import assert from "node:assert/strict";
import test from "node:test";
import type { createAdminClient } from "@/lib/supabase/admin";
import { commonLinksSchema, DEFAULT_COMMON_LINKS } from "./common-links";
import { loadCommonLinks, saveCommonLinks } from "./common-links-storage";

test("공통 링크는 이름과 웹 주소만 허용하고 순서와 빈 명단을 보존한다", () => {
  assert.deepEqual(commonLinksSchema.parse([{ label: " 문서 ", url: " https://example.com/a " }]), [{ label: "문서", url: "https://example.com/a" }]);
  assert.deepEqual(commonLinksSchema.parse([]), []);
  for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///test", "not a url", "https://user:password@example.com"]) {
    assert.equal(commonLinksSchema.safeParse([{ label: "링크", url }]).success, false);
  }
  assert.equal(commonLinksSchema.safeParse([{ label: " ", url: "https://example.com" }]).success, false);
  assert.equal(commonLinksSchema.safeParse(Array.from({ length: 51 }, () => DEFAULT_COMMON_LINKS[0])).success, false);
});

function fakeStorage(result: unknown, calls: string[] = []) {
  return { storage: {
    from: () => ({ download: async () => result, upload: async (_path: string, body: string) => { calls.push(body); return { error: null }; } }),
    getBucket: async () => ({ data: null, error: { message: "Bucket not found", statusCode: "404" } }),
    createBucket: async (_name: string, options: { public: boolean }) => { assert.equal(options.public, false); calls.push("created"); return { error: null }; },
  } } as unknown as ReturnType<typeof createAdminClient>;
}

test("저장 전에는 기본 링크를 제공하고, 저장된 빈 명단은 되살리지 않는다", async () => {
  assert.deepEqual(await loadCommonLinks(fakeStorage({ data: null, error: { message: "Object not found", statusCode: "404" } })), DEFAULT_COMMON_LINKS);
  assert.deepEqual(await loadCommonLinks(fakeStorage({ data: new Blob(["[]"]), error: null })), []);
  await assert.rejects(loadCommonLinks(fakeStorage({ data: null, error: { message: "Unauthorized", statusCode: "403" } })));
  await assert.rejects(loadCommonLinks(fakeStorage({ data: new Blob(["invalid"]), error: null })));
});

test("비공개 저장소에 전체 링크와 순서를 저장하며 잘못된 값은 쓰지 않는다", async () => {
  const calls: string[] = [];
  const admin = fakeStorage(null, calls);
  const links = [...DEFAULT_COMMON_LINKS].reverse();
  assert.deepEqual(await saveCommonLinks(links, admin), links);
  assert.deepEqual(calls, ["created", JSON.stringify(links)]);
  await assert.rejects(saveCommonLinks([{ label: "잘못된 링크", url: "javascript:alert(1)" }], admin));
  assert.equal(calls.length, 2);
});
