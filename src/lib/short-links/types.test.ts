import assert from "node:assert/strict";
import test from "node:test";
import { SHORT_LINK_TYPES, POST_SALES_SHORT_LINK_TYPE, findShortLinkType } from "./types";

test("UI bindings use unique semantic keys and the correct source fields", () => {
  const types = [...Object.values(SHORT_LINK_TYPES), POST_SALES_SHORT_LINK_TYPE].map(item => item.typeKey);
  assert.equal(new Set(types).size, types.length);
  for (const type of types) assert.match(type, /^[a-z][a-z0-9_]{0,63}$/);
  assert.equal(SHORT_LINK_TYPES.landingPageQrLink.typeKey, "landing");
  assert.equal(SHORT_LINK_TYPES.paymentLink.typeKey, "payment");
  assert.equal(findShortLinkType("payment")?.sourceField, "basicPaymentPageLink");
  assert.equal(findShortLinkType("9999"), undefined);
  assert.equal(findShortLinkType("aftersales")?.label, "사후 세일즈");
});
