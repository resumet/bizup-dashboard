import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listComparisonRosters, loadComparisonStudents, parseComparisonRosterIds } from "./server";

test("빈 선택·잘못된 ID·100개 초과를 거절하고 중복 ID를 제거한다", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(parseComparisonRosterIds([id,id]), [id]);
  for (const value of [[], "bad", ["bad"], Array(101).fill(id)]) assert.throws(() => parseComparisonRosterIds(value), /1~100개/);
});

test("명단 목록은 1000건 이후 페이지까지 가져온다", async () => {
  const calls: number[] = [];
  const query = { select: () => query, eq: () => query, order: () => query, range: async (start: number) => { calls.push(start); return { data: Array.from({ length: start === 0 ? 1000 : 1 }, (_, i) => ({ id: String(start + i), name: "명단", valid_count: 1 })), error: null }; } };
  const client = { from: () => query } as unknown as SupabaseClient;
  assert.equal((await listComparisonRosters(client)).length, 1001);
  assert.deepEqual(calls, [0,1000]);
});

test("선택 명단 일부에 권한이 없으면 연락처를 읽기 전에 실패한다", async () => {
  const client = { from: (table: string) => {
    assert.equal(table, "course_jobs");
    return { select: () => ({ in: () => ({ eq: async () => ({ data: [{ id: "allowed" }], error: null }) }) }) };
  } } as unknown as SupabaseClient;
  await assert.rejects(loadComparisonStudents(client, ["allowed", "forbidden"]), /조회할 수 없거나/);
});

test("여러 선택 명단의 최신 버전을 끝까지 읽고 출처를 함께 전달한다", async () => {
  const versions: number[] = [];
  const client = { from: (table: string) => {
    if (table === "course_jobs") return { select: () => ({ in: () => ({ eq: async () => ({ data: [{ id: "a", name: "명단A", latest_version: 3 }, { id: "b", name: "명단B", latest_version: 7 }], error: null }) }) }) };
    let job = "";
    const query = { select: () => query, eq: (field: string, value: string | number) => { if (field === "job_id") job = String(value); if (field === "version") versions.push(Number(value)); return query; }, order: () => query, range: async (start: number) => ({ data: start ? [] : Array.from({ length: job === "a" ? 1000 : 1 }, (_, index) => ({ id: String(index), source_row_number: index+2, normalized_phone: "01012345678", normalized_values: { customerName: "회원", email: "member@example.com" } })), error: null }) };
    return query;
  } } as unknown as SupabaseClient;
  const contacts = await loadComparisonStudents(client, ["a", "b"]);
  assert.equal(contacts.length, 1001); assert.ok(versions.includes(3) && versions.includes(7));
  assert.equal(contacts[0].source, "명단A"); assert.equal(contacts[1000].source, "명단B");
});
