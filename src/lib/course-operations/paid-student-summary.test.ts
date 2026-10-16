import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCoursePaidStudentSummariesFromClient } from "./paid-student-summary";

test("유료수강생 집계는 최신 명단의 환불·중복을 제외한 실제 인원수와 수동 현금액을 사용한다", async () => {
  const rows = Array.from({ length: 72 }, (_, index) => ({
    id: `row-${index}`,
    source_row_number: index + 2,
    normalized_phone: `010${String(index === 4 ? 3 : index).padStart(8, "0")}`,
    normalized_values: {
      customerName: `수강생 ${index}`,
      phone: `010${String(index === 4 ? 3 : index).padStart(8, "0")}`,
      email: "",
      ...(index < 2 ? { refundedAt: "2026-09-19T00:00:00Z" } : {}),
      ...(index === 2 ? { paymentMethod: "현금결제", paymentAmount: "120,000.50" } : {}),
      ...(index === 3 ? { paymentMethod: "현금결제", paymentAmount: "80,000" } : {}),
    },
    is_duplicate: false,
    is_extra_participant: false,
    is_manually_added: index === 2,
  }));

  const client = {
    from(table: string) {
      if (table === "course_jobs") {
        const query = {
          select: () => query,
          eq: () => query,
          order: async () => ({
            data: [{ id: "paid-job", course_id: "course-2", latest_version: 29 }],
            error: null,
          }),
        };
        return query;
      }
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: async (start: number, end: number) => ({
          data: rows.slice(start, end + 1),
          error: null,
        }),
      };
      return query;
    },
  } as unknown as SupabaseClient;

  assert.deepEqual(
    await loadCoursePaidStudentSummariesFromClient(client, "workspace"),
    [{ course_id: "course-2", paid_student_count: 69, manual_cash_amount: 120_000.5 }],
  );
});
