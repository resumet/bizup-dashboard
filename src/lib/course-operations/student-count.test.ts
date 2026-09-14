import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStudentsSection } from "./detail-sections";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";

test("강의 인원·연결 명단 인원·미리보기·전체보기가 환불자를 동일하게 제외한다", async () => {
  const jobs = [{ id: "job", name: "명단", course_id: "course", latest_version: 2, valid_count: 97 }];
  const rows = Array.from({ length: 97 }, (_, i) => ({ id: String(i), source_row_number: i + 2, normalized_phone: String(i), normalized_values: { customerName: `회원${i}`, email: "", source: "", optionName: "기본", ...(i === 0 ? { refundedAt: "2026-09-14T00:00:00Z" } : {}) } }));
  const client = { from: (table: string) => {
    if (table === "job_enrollments") {
      const query = { select: () => query, eq: () => query, order: () => query, range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }) };
      return query;
    }
    const query = { select: () => query, or: () => query, order: async () => ({ data: table === "course_jobs" ? jobs : [], error: null }) };
    return query;
  } } as unknown as SupabaseClient;
  const section = await loadStudentsSection(client, "course", "");
  const fullRows = await loadJobEnrollmentRows(client, "job", 2);
  assert.equal(fullRows.length, 96);
  assert.equal(section.rosterJobs[0].valid_count, fullRows.length);
  assert.equal(section.paidRosterAnalysis?.totalCount, fullRows.length);
  assert.equal(section.paidStudentPreview.length, 20);
  assert.ok(section.paidStudentPreview.every((row) => row.id !== "0"));
});
