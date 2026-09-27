import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeChannelEmail } from "./model";

test("channel email is normalized and can be removed", () => {
  assert.equal(normalizeChannelEmail("  Contact+team@example.co.kr  "), "Contact+team@example.co.kr");
  assert.equal(normalizeChannelEmail(" "), null);
  assert.equal(normalizeChannelEmail(null), null);
});

test("channel email rejects malformed and oversized values", () => {
  for (const value of [undefined, 123, "missing-at.example.com", "a@invalid", "a@bad..com", "a b@example.com", `a@${"x".repeat(250)}.com`]) {
    assert.throws(() => normalizeChannelEmail(value), /INVALID_EMAIL/);
  }
});
