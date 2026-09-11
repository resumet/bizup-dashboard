import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMessageSource, loadRosterMessageContacts } from "./recipient-source-server";
import { messageHistorySourceId, messageHistorySourceName, messageSourceMatches, parseRecipientSource, rosterSourceId } from "./recipient-source";

test("같은 ID의 주소록과 수강생 명단은 서로 다른 발송·이력 대상으로 연결된다", () => {
  assert.deepEqual(parseRecipientSource("same-id"), { kind: "address-book", id: "same-id" });
  assert.deepEqual(parseRecipientSource(rosterSourceId("same-id")), { kind: "roster", id: "same-id" });
  assert.equal(messageHistorySourceId({ address_book_id: "same-id" }), "same-id");
  assert.equal(messageHistorySourceId({ address_book_id: null, course_job_id: "same-id" }), "roster:same-id");
});

test("발송 이력의 가상 수강생 명단 주소는 UUID 부분만 비교한다", () => {
  assert.equal(
    messageSourceMatches("roster:job-1", {
      address_book_id: null,
      course_job_id: "job-1",
    }),
    true,
  );
  assert.equal(
    messageSourceMatches("roster:job-2", {
      address_book_id: null,
      course_job_id: "job-1",
    }),
    false,
  );
  assert.equal(
    messageSourceMatches("book-1", {
      address_book_id: "book-1",
      course_job_id: null,
    }),
    true,
  );
});

test("발송 소스 관계가 비어도 이력 상세에 표시할 이름을 제공한다", () => {
  assert.equal(messageHistorySourceName({ address_books: { name: "고객 주소록" } }), "고객 주소록");
  assert.equal(messageHistorySourceName({ course_job_id: "roster-1", course_jobs: [{ name: "9월 수강생" }] }), "9월 수강생");
  assert.equal(messageHistorySourceName({ course_job_id: "roster-1", course_jobs: null }), "삭제된 수강생 명단");
});

function sourceClient(data: unknown, expectedTable: string) {
  return {
    from(table: string) {
      assert.equal(table, expectedTable);
      const query = {
        select() { return query; },
        eq(field: string, value: string) { assert.equal(field, "id"); assert.equal(value, "source-1"); return query; },
        async maybeSingle() { return { data, error: null }; },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

test("수강생 명단의 최신 버전을 사용하고 접근 불가·미완료 명단은 거부한다", async () => {
  const row = { name: "수강생 명단", workspace_id: "workspace-1", latest_version: 3, valid_count: 25, status: "ready" };
  const source = await loadMessageSource(sourceClient(row, "course_jobs"), "roster:source-1");
  assert.equal(source.version, 3);
  assert.equal(source.contact_count, 25);
  await assert.rejects(loadMessageSource(sourceClient(null, "course_jobs"), "roster:source-1"), /접근 권한/);
  await assert.rejects(loadMessageSource(sourceClient({ ...row, status: "processing" }, "course_jobs"), "roster:source-1"), /분석이 완료/);
  const book = await loadMessageSource(sourceClient({ name: "주소록", workspace_id: "workspace-1", contact_count: 5 }, "address_books"), "source-1");
  assert.equal(book.kind, "address-book");
  assert.equal(book.version, undefined);
});

test("최신 명단을 페이지 끝까지 읽고 이름을 매핑하며 중복 전화번호는 첫 수신자를 유지한다", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    id: `row-${index}`, source_row_number: index + 2,
    normalized_phone: index === 1000 ? "01000000000" : `010${String(index).padStart(8, "0")}`,
    normalized_values: { customerName: `수강생 ${index}`, email: `${index}@example.com` },
    is_duplicate: index === 1000, is_extra_participant: false,
  }));
  const pages: number[] = [];
  const client = {
    from(table: string) {
      assert.equal(table, "job_enrollments");
      const filters: Record<string, unknown> = {};
      const query = {
        select() { return query; },
        eq(field: string, value: unknown) { filters[field] = value; return query; },
        order(field: string) { assert.equal(field, "source_row_number"); return query; },
        async range(start: number, end: number) {
          assert.deepEqual(filters, { job_id: "roster-1", version: 3 });
          pages.push(start);
          return { data: rows.slice(start, end + 1), error: null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const contacts = await loadRosterMessageContacts(client, "roster-1", 3);
  assert.deepEqual(pages, [0, 1000]);
  assert.equal(contacts.length, 1000);
  assert.deepEqual(contacts[0], { id: "row-0", name: "수강생 0", email: "0@example.com", normalized_phone: "01000000000" });
  assert.equal(contacts.at(-1)?.id, "row-999");

  const selectedDuplicate = await loadRosterMessageContacts(
    client,
    "roster-1",
    3,
    ["row-1000"],
  );
  assert.deepEqual(selectedDuplicate, [
    {
      id: "row-1000",
      name: "수강생 1000",
      email: "1000@example.com",
      normalized_phone: "01000000000",
    },
  ]);
});
