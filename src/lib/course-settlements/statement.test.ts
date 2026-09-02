import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeSettlementStatementDraft } from "./statement";

test("정산서를 저장할 때 비용 정보는 보존하고 첨부 객체는 분리한다", () => {
  const draft = sanitizeSettlementStatementDraft(
    {
      lectureName: "테스트 강의",
      instructorRatioPercent: 55.5,
      costs: [
        {
          id: "cost-1",
          name: "광고비",
          burden: "shared",
          manager: "담당자",
          amount: 1234.6,
          occurredOn: "2026-09-03",
          note: "유지할 메모",
          evidenceRequired: true,
          evidenceType: "카드영수증",
          evidenceNeedsReview: true,
          attachments: [{ id: "file-1", name: "영수증.png" }],
        },
      ],
    },
    "기본 강의",
  );

  assert.equal(draft.costs[0].name, "광고비");
  assert.equal(draft.costs[0].amount, 1235);
  assert.equal(draft.costs[0].burden, "shared");
  assert.equal(draft.costs[0].note, "유지할 메모");
  assert.deepEqual(draft.costs[0].attachments, []);
  assert.equal(draft.instructorRatioPercent, 55.5);
});

test("잘못된 정산서 값은 허용 범위로 정리한다", () => {
  const draft = sanitizeSettlementStatementDraft(
    {
      instructorRatioPercent: 120,
      status: "임의상태",
      costs: [{ id: "", burden: "unknown", amount: -10 }],
    },
    "강의명",
  );

  assert.equal(draft.instructorRatioPercent, 100);
  assert.equal(draft.status, "작성중");
  assert.equal(draft.costs[0].id, "cost-1");
  assert.equal(draft.costs[0].burden, "company");
  assert.equal(draft.costs[0].amount, 0);
});
