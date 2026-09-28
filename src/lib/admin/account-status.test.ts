import assert from "node:assert/strict";
import test from "node:test";
import { isAccountDisabled, requireAccountStatusChange } from "./account-status";
import { SUPER_ADMIN_EMAIL } from "./access";

test("account disabling is explicit and independent of expired bans", () => {
  assert.equal(isAccountDisabled({}), false);
  assert.equal(isAccountDisabled({ app_metadata: { account_disabled: true } }), true);
  assert.equal(isAccountDisabled({ app_metadata: { account_disabled: false }, banned_until: "2099-01-01" }), true);
  assert.equal(isAccountDisabled({ banned_until: "2000-01-01" }), false);
  assert.equal(isAccountDisabled({ app_metadata: { account_disabled: true }, banned_until: "2000-01-01" }), true);
});
test("self and super administrator cannot be disabled; status requires a boolean", () => {
  assert.throws(() => requireAccountStatusChange("a", { id: "a" }, false));
  assert.throws(() => requireAccountStatusChange("a", { id: "b", email: SUPER_ADMIN_EMAIL }, false));
  assert.throws(() => requireAccountStatusChange("a", { id: "b" }, "false"));
  assert.equal(requireAccountStatusChange("a", { id: "b" }, false), false);
  assert.equal(requireAccountStatusChange("a", { id: "b" }, true), true);
});
