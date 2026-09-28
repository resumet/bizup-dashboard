import assert from "node:assert/strict";
import test from "node:test";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadWorkspacePeople } from "./server";
import { loadHrLeaveDashboard } from "@/lib/hr-leave/server";

test("inactive accounts are removed from people and leave rows without deleting history", async () => {
  const original = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  let disabled = true;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.ok(!init?.method || ["GET", "POST"].includes(init.method));
    if (url.pathname.endsWith("/admin/users")) return Response.json({ users: ["active", "inactive"].map(id => ({ id, email: `${id}@example.com`, created_at: "2020-01-01", email_confirmed_at: "2020-01-01", user_metadata: { display_name: id }, app_metadata: { account_disabled: id === "inactive" && disabled } })) });
    if (url.pathname.endsWith("/personnel_directory")) return Response.json([{ user_id: "inactive", name: "비활성 직원", active: true }]);
    if (url.pathname.endsWith("/workspace_members")) return Response.json(["active", "inactive"].map(user_id => ({ user_id, created_at: "2020-01-01" })));
    if (url.pathname.endsWith("/hr_leave_requests")) return Response.json(["active", "inactive"].map(user_id => ({ id: user_id, user_id, days: 1, status: "approved" })));
    if (url.pathname.endsWith("/hr_leave_support_records")) return Response.json(["active", "inactive"].map(user_id => ({ id: user_id, user_id, earned_days: 1, status: "approved" })));
    return Response.json([]);
  };
  try {
    assert.deepEqual((await loadWorkspacePeople("workspace")).map(p => p.id), ["active"]);
    assert.equal((await loadWorkspacePeople("workspace", true)).length, 2);
    const context = { admin: createAdminClient(), workspaceId: "workspace", user: { id: "active" }, isAdmin: true, isSuperAdmin: true, today: "2026-09-28" };
    const result = await loadHrLeaveDashboard(context, 2026);
    assert.deepEqual(result.people.map(p => p.id), ["active"]);
    assert.deepEqual(result.requests.map(r => r.user_id), ["active"]);
    assert.deepEqual(result.supportRecords.map(r => r.user_id), ["active"]);
    disabled = false;
    assert.equal((await loadWorkspacePeople("workspace")).length, 2);
    assert.equal((await loadHrLeaveDashboard(context, 2026)).requests.length, 2);
  } finally {
    globalThis.fetch = original;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
