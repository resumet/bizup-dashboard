import assert from "node:assert/strict";
import test from "node:test";
import { SHORT_LINK_TYPES, findShortLinkType } from "./types";

test("registered types are unique four-digit strings and existing allocations remain stable", () => {
  const types = Object.values(SHORT_LINK_TYPES).map(item => item.type);
  assert.equal(new Set(types).size, types.length);
  for (const type of types) assert.match(type, /^\d{4}$/);
  assert.equal(SHORT_LINK_TYPES.landingPageQrLink.type, "0000");
  assert.equal(SHORT_LINK_TYPES.paymentLink.type, "0001");
  assert.equal(findShortLinkType("0001")?.sourceField, "basicPaymentPageLink");
  assert.equal(findShortLinkType("9999"), undefined);
});
