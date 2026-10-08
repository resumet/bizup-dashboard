import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { calendarLeaveOption, loadCalendarLeaves, loadCalendarSources, loadCalendarWebinars } from "./sources-server";

test("연동 조회는 범위·워크스페이스·직원 권한을 검증하고 민감한 HR 열을 요청하지 않는다", async (t) => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://calendar.test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "calendar-test-key";
  const workspaceId = "00000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-000000000011";
  const staffId = "00000000-0000-4000-8000-000000000012";
  const inactiveId = "00000000-0000-4000-8000-000000000013";
  const range = { from: "2026-10-01", to: "2026-10-31" };
  let allowed = true;
  let webinarFailure = false;
  let leaveFailure = false;
  const calls: URL[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url);
    assert.ok(!init?.method || ["GET", "POST"].includes(init.method));
    if (url.pathname.endsWith("/personnel_access")) {
      assert.deepEqual(JSON.parse(String(init?.body)), { p_workspace_id: workspaceId, p_user_id: userId });
      return Response.json(allowed);
    }
    if (url.pathname.endsWith("/admin/users")) return Response.json({ users: [userId, staffId, inactiveId].map((id) => ({ id, email: `${id}@example.invalid`, created_at: "2020-01-01", email_confirmed_at: "2020-01-01", user_metadata: { display_name: "검증 이름" }, app_metadata: {} })) });
    if (url.pathname.endsWith("/workspace_members")) return Response.json([userId, staffId, inactiveId].map((user_id) => ({ user_id })));
    if (url.pathname.endsWith("/personnel_directory")) return Response.json([{ user_id: staffId, name: "재직 직원", active: true }, { user_id: inactiveId, name: "퇴직 직원", active: false }]);
    if (url.pathname.endsWith("/hr_leave_requests")) return leaveFailure ? Response.json({ code: "XX000" }, { status: 500 }) : Response.json([staffId, inactiveId].map((user_id) => ({ id: user_id, user_id, leave_date: "2026-10-12", unit: "am", status: "approved", reason: "secret reason" })));
    if (url.pathname.endsWith("/courses")) return webinarFailure ? Response.json({ code: "XX000" }, { status: 500 }) : Response.json([{ id: staffId, name: "검증 강의", instructor_name: "강사", cohort: null, free_webinar_at: "2026-10-12T10:30:00Z" }]);
    throw new Error(`Unexpected calendar endpoint: ${url.pathname}`);
  };
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, "test-member-key", { auth: { persistSession: false } });
  const context = { supabase, workspaceId, user: { id: userId }, isAdmin: false } as Parameters<typeof loadCalendarSources>[0];
  try {
    await t.test("옵션이 꺼져 있으면 HR 계정·직원·휴가를 전혀 조회하지 않는다", async () => {
      calls.length = 0;
      const result = await loadCalendarSources(context, range);
      assert.equal(result.sources.length, 1);
      assert.equal(result.sourcesWarning, "");
      assert.ok(calls.every((url) => url.pathname.endsWith("/courses")));
      const url = calls[0];
      assert.equal(url.searchParams.get("workspace_id"), `eq.${workspaceId}`);
      assert.equal(url.searchParams.get("free_webinar_at"), "gte.2026-10-01T00:00:00+09:00");
      assert.deepEqual(url.searchParams.getAll("free_webinar_at"), ["gte.2026-10-01T00:00:00+09:00", "lt.2026-11-01T00:00:00+09:00"]);
    });
    await t.test("일반 활성 직원도 승인된 동료 일정의 최소 정보만 볼 수 있다", async () => {
      calls.length = 0;
      const result = await loadCalendarLeaves(context, range);
      assert.equal(result.length, 1);
      assert.equal(result[0].title, "재직 직원 · 오전 반차");
      assert.ok(!JSON.stringify(result).includes("secret"));
      const url = calls.find((item) => item.pathname.endsWith("/hr_leave_requests"))!;
      assert.equal(url.searchParams.get("select"), "id,user_id,leave_date,unit,status");
      assert.equal(url.searchParams.get("workspace_id"), `eq.${workspaceId}`);
      assert.equal(url.searchParams.get("status"), "eq.approved");
      assert.equal(url.searchParams.get("leave_date"), "gte.2026-10-01");
      assert.deepEqual(url.searchParams.getAll("leave_date"), ["gte.2026-10-01", "lte.2026-10-31"]);
    });
    await t.test("직원 권한이 없으면 디렉터리나 휴가 테이블 조회 전에 거부한다", async () => {
      calls.length = 0; allowed = false;
      await assert.rejects(() => loadCalendarLeaves(context, range), /활성 직원/u);
      assert.equal(calls.length, 1);
      assert.ok(calls[0].pathname.endsWith("/personnel_access"));
      allowed = true;
    });
    await t.test("선택 연동 장애는 다른 연동·기존 일정 조회를 실패시키지 않는다", async () => {
      leaveFailure = true;
      let result = await loadCalendarSources(context, range, true);
      assert.equal(result.sources.length, 1); assert.match(result.sourcesWarning, /직원 휴가/u);
      leaveFailure = false; webinarFailure = true;
      result = await loadCalendarSources(context, range, true);
      assert.equal(result.sources.length, 1); assert.equal(result.sources[0].source, "leave"); assert.match(result.sourcesWarning, /웨비나/u);
      webinarFailure = false;
    });
    await t.test("웨비나 목록은 500건 이상도 페이지로 조회한다", async () => {
      const fetchBeforePaging = globalThis.fetch;
      const offsets: string[] = [];
      globalThis.fetch = async (input) => {
        const url = new URL(String(input)); offsets.push(url.searchParams.get("offset")!);
        return Response.json(Array.from({ length: offsets.length === 1 ? 500 : 1 }, (_, i) => ({ id: `${offsets.length}-${i}`, name: "강의", instructor_name: "강사", cohort: null, free_webinar_at: "2026-10-12T10:30:00Z" })));
      };
      try { assert.equal((await loadCalendarWebinars(supabase, workspaceId, range)).length, 501); assert.deepEqual(offsets, ["0", "500"]); }
      finally { globalThis.fetch = fetchBeforePaging; }
    });
    await t.test("휴가 표시 쿼리 옵션은 명시적인 참·거짓만 허용한다", () => {
      assert.equal(calendarLeaveOption(null), false); assert.equal(calendarLeaveOption("false"), false); assert.equal(calendarLeaveOption("true"), true);
      for (const value of ["1", "yes", "", "TRUE"]) assert.throws(() => calendarLeaveOption(value));
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
