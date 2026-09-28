import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "./auth";

test("authentication checks fresh account status rather than old JWT claims", async () => {
  let disabled = false;
  const client = { auth: { getUser: async () => ({ data: { user: { id: "test", email: "test@example.com", app_metadata: { account_disabled: disabled } } }, error: null }) } } as unknown as SupabaseClient;
  assert.equal((await getAuthenticatedUser(client))?.id, "test");
  disabled = true;
  assert.equal(await getAuthenticatedUser(client), null);
  disabled = false;
  assert.equal((await getAuthenticatedUser(client))?.id, "test");
});
