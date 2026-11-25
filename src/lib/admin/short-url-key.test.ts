import assert from "node:assert/strict";
import test from "node:test";
import { decryptShortUrlKey, encryptShortUrlKey, loadShortUrlApiKey, saveShortUrlApiKey, shortUrlKeySchema, shortUrlKeyStatus } from "./short-url-key";
import type { createAdminClient } from "@/lib/supabase/admin";

test("API keys are encrypted with randomized authenticated ciphertext", () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-secret";
  try {
    const key = "test-api-key-123";
    const first = encryptShortUrlKey(key);
    const second = encryptShortUrlKey(key);
    assert.notEqual(first, second);
    assert.ok(!first.includes(key));
    assert.equal(decryptShortUrlKey(first), key);
    const parts = first.split(".");
    const bytes = Buffer.from(parts[2], "base64url");
    bytes[0] ^= 1;
    parts[2] = bytes.toString("base64url");
    assert.throws(() => decryptShortUrlKey(parts.join(".")));
    process.env.SUPABASE_SERVICE_ROLE_KEY = "different-secret";
    assert.throws(() => decryptShortUrlKey(first));
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test("blank or invalid keys cannot overwrite a saved key", () => {
  for (const apiKey of ["", "   ", "a b", "a\nb", "a".repeat(4097)]) {
    assert.equal(shortUrlKeySchema.safeParse({ apiKey }).success, false);
  }
  assert.deepEqual(shortUrlKeySchema.parse({ apiKey: " key-123 " }), { apiKey: "key-123" });
});

test("save, reload and replace persist only ciphertext and return only status", async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-secret";
  let stored: string | null = null;
  const admin = { storage: {
    getBucket: async () => ({ data: { public: false }, error: null }),
    from: () => ({
      download: async () => stored === null
        ? { data: null, error: { statusCode: "404", message: "Object not found" } }
        : { data: new Blob([stored]), error: null },
      upload: async (_path: string, value: string) => { stored = value; return { error: null }; },
    }),
  } } as unknown as ReturnType<typeof createAdminClient>;
  try {
    assert.deepEqual(await shortUrlKeyStatus(admin), { configured: false, updatedAt: null });
    const result = await saveShortUrlApiKey({ apiKey: "first-key" }, admin);
    assert.deepEqual(Object.keys(result).sort(), ["configured", "updatedAt"]);
    assert.ok(!stored!.includes("first-key"));
    assert.deepEqual(await shortUrlKeyStatus(admin), result);
    assert.equal(await loadShortUrlApiKey(admin), "first-key");
    await assert.rejects(saveShortUrlApiKey({ apiKey: "" }, admin));
    assert.equal(await loadShortUrlApiKey(admin), "first-key");
    await saveShortUrlApiKey({ apiKey: "second-key" }, admin);
    assert.equal(await loadShortUrlApiKey(admin), "second-key");
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});
