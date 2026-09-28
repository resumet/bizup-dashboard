import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNEL_CATEGORIES, normalizeAppearanceFee, normalizeChannelCategory, normalizeChannelMemo, normalizeExcludedFromUpdates, normalizeRsPercent } from "./model";

test("channel categories are unique and restricted to the dropdown choices", () => {
  assert.equal(CHANNEL_CATEGORIES.length, new Set(CHANNEL_CATEGORIES).size);
  assert.equal(normalizeChannelCategory("인베이더스쿨"), "인베이더스쿨");
  assert.equal(normalizeChannelCategory(""), null);
  assert.equal(normalizeChannelCategory(null), null);
  assert.throws(() => normalizeChannelCategory("기타"), /INVALID_CATEGORY/);
});

test("appearance fee accepts nonnegative whole won amounts and comma formatting", () => {
  assert.equal(normalizeAppearanceFee("1,234,567"), 1234567);
  assert.equal(normalizeAppearanceFee(0), 0);
  assert.equal(normalizeAppearanceFee(""), null);
  for (const value of [-1, 1.25, "-1", "1.25", "abc", Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => normalizeAppearanceFee(value), /INVALID_APPEARANCE_FEE/);
  }
});

test("RS percentages accept finite values from 0 through 100", () => {
  assert.equal(normalizeRsPercent("0"), 0);
  assert.equal(normalizeRsPercent("25.125"), 25.125);
  assert.equal(normalizeRsPercent(100), 100);
  assert.equal(normalizeRsPercent(null), null);
  for (const value of [-1, 100.001, "101", "-0.5", "abc", "Infinity", Infinity]) {
    assert.throws(() => normalizeRsPercent(value), /INVALID_RS_PERCENT/);
  }
});

test("channel memo preserves line breaks and is limited to 2,000 characters", () => {
  assert.equal(normalizeChannelMemo("첫 줄\n둘째 줄"), "첫 줄\n둘째 줄");
  assert.equal(normalizeChannelMemo("   \n  "), null);
  assert.equal(normalizeChannelMemo(null), null);
  assert.throws(() => normalizeChannelMemo("a".repeat(2001)), /INVALID_MEMO/);
  assert.throws(() => normalizeChannelMemo(123), /INVALID_MEMO/);
});

test("update exclusion accepts booleans only", () => {
  assert.equal(normalizeExcludedFromUpdates(true), true);
  assert.equal(normalizeExcludedFromUpdates(false), false);
  for (const value of [null, 0, 1, "true", "false"]) {
    assert.throws(() => normalizeExcludedFromUpdates(value), /INVALID_EXCLUDED_FROM_UPDATES/);
  }
});
