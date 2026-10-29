import assert from "node:assert/strict";
import test from "node:test";

import type { CourseCost } from "@/lib/course-costs/types";
import { youtubeRsAppendixHtml } from "./youtube-rs-appendix";

function cost(input: Partial<CourseCost> = {}): CourseCost {
  return {
    id: "cost-rs", courseId: "course-1", categoryCode: "YOUTUBE_RS", name: "유튜브 RS", burdenType: "SHARED",
    managerUserId: null, managerName: "유튜브", grossAmount: 125_000, supplyAmount: 113_636, vatAmount: 11_364,
    taxType: "TAXABLE", paidDate: "2026-10-29", status: "PAID", evidenceRequired: false, evidenceNeedsReview: false,
    evidenceTypes: [], otherEvidenceType: "", companyShareRate: 50, instructorShareRate: 50, companyShareAmount: 62_500,
    instructorShareAmount: 62_500, includeInSettlement: true, note: "", migratedFrom: null, version: 1,
    createdBy: "", createdAt: "", updatedBy: "", updatedAt: "", attachments: [],
    calculationDetails: {
      kind: "YOUTUBE_RS",
      version: 1,
      calculatedAt: "2026-10-29T00:00:00.000Z",
      channels: [{
        appearanceId: "appearance-1",
        channelName: "초월 <스토리>",
        channelUrl: "https://youtube.com/@chowol",
        rsPercent: 25,
        payers: [
          { orderId: "order-1", name: "김&선아", rsLabel: "초월스토리", paymentAmount: 500_000, feeAmount: 125_000, included: true },
          { orderId: "order-2", name: "제외 결제자", rsLabel: "초월스토리", paymentAmount: 300_000, feeAmount: 75_000, included: false },
        ],
      }],
    },
    ...input,
  };
}

test("유튜브 RS 비용의 채널별 포함 결제자와 계산 합계를 정산서 부록으로 만든다", () => {
  const html = youtubeRsAppendixHtml([cost()]);
  assert.match(html, /유튜브 RS 상세 구성/u);
  assert.match(html, /초월 &lt;스토리&gt;/u);
  assert.match(html, /김&amp;선아/u);
  assert.match(html, /500,000원/u);
  assert.match(html, /25%/u);
  assert.match(html, /125,000원/u);
  assert.match(html, /총 RS 수수료/u);
  assert.doesNotMatch(html, /제외 결제자/u);
});

test("RS 상세 내역이 없는 비용만 있으면 부록을 만들지 않는다", () => {
  assert.equal(youtubeRsAppendixHtml([cost({ calculationDetails: null })]), "");
});
