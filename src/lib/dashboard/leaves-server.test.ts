import assert from "node:assert/strict";
import test from "node:test";

import { loadDashboardLeaves } from "./leaves-server";

test("대시보드 휴가는 7일 범위의 승인·승인대기 최소 정보만 조회한다", async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dashboard-leaves.test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dashboard-leaves-test-key";

  const workspaceId = "00000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-000000000011";
  const staffId = "00000000-0000-4000-8000-000000000012";
  const calls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    if (url.pathname.endsWith("/personnel_access")) return Response.json(true);
    if (url.pathname.endsWith("/workspace_members")) return Response.json([{ user_id: staffId }]);
    if (url.pathname.endsWith("/admin/users")) {
      return Response.json({
        users: [{
          id: staffId,
          email: "staff@example.invalid",
          created_at: "2020-01-01T00:00:00Z",
          email_confirmed_at: "2020-01-01T00:00:00Z",
          user_metadata: { display_name: "직원" },
          app_metadata: {},
        }],
      });
    }
    if (url.pathname.endsWith("/personnel_directory")) {
      return Response.json([{ user_id: staffId, name: "직원", active: true }]);
    }
    if (url.pathname.endsWith("/hr_leave_requests")) {
      return Response.json([
        { id: "approved", user_id: staffId, leave_date: "2026-10-30", unit: "full", status: "approved" },
        { id: "pending", user_id: staffId, leave_date: "2026-11-06", unit: "am", status: "pending" },
      ]);
    }
    throw new Error(`Unexpected dashboard leave endpoint: ${url.pathname}`);
  };

  try {
    const result = await loadDashboardLeaves({ workspaceId, user: { id: userId } }, "2026-10-30");
    assert.deepEqual(result.map(({ id, status }) => ({ id, status })), [
      { id: "approved", status: "today" },
      { id: "pending", status: "pending" },
    ]);

    const request = calls.find((url) => url.pathname.endsWith("/hr_leave_requests"));
    assert.ok(request);
    assert.equal(request.searchParams.get("select"), "id,user_id,leave_date,unit,status");
    assert.equal(request.searchParams.get("workspace_id"), `eq.${workspaceId}`);
    assert.equal(request.searchParams.get("status"), "in.(approved,pending)");
    assert.deepEqual(request.searchParams.getAll("leave_date"), ["gte.2026-10-30", "lte.2026-11-06"]);
    assert.ok(!request.searchParams.get("select")?.includes("reason"));
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
