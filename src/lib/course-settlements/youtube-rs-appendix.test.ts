import assert from "node:assert/strict";
import test from "node:test";

import type { CourseCost } from "@/lib/course-costs/types";
import { youtubeChannelCostAppendixHtml } from "./youtube-rs-appendix";

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

function appearanceFeeCost(input: Partial<CourseCost> = {}): CourseCost {
  return cost({
    id: "cost-appearance", categoryCode: "YOUTUBE_FIXED", name: "유튜브 출연료", burdenType: "COMPANY",
    managerName: "시스템노바", grossAmount: 550_000, supplyAmount: 500_000, vatAmount: 50_000,
    companyShareRate: 100, instructorShareRate: 0, companyShareAmount: 550_000, instructorShareAmount: 0,
    calculationDetails: {
      kind: "YOUTUBE_APPEARANCE_FEE",
      version: 1,
      calculatedAt: "2026-10-29T00:00:00.000Z",
      channels: [
        { appearanceId: "appearance-1", channelName: "초월 <스토리>", channelUrl: "https://youtube.com/@chowol", linkedChannelId: "channel-1", linkedChannelName: "초월스토리 공식", linkedChannelUrl: "https://youtube.com/@chowol", appearanceFee: 500_000, included: true },
        { appearanceId: "appearance-2", channelName: "제외 채널", channelUrl: "", linkedChannelId: null, linkedChannelName: "", linkedChannelUrl: "", appearanceFee: 300_000, included: false },
      ],
    },
    ...input,
  });
}

test("유튜브 RS 비용의 채널별 포함 결제자와 계산 합계를 정산서 부록으로 만든다", () => {
  const html = youtubeChannelCostAppendixHtml([cost()]);
  assert.match(html, /유튜브 채널 출연료 \/ RS 비용 상세 내역/u);
  assert.match(html, /초월 &lt;스토리&gt;/u);
  assert.match(html, /김&amp;선아/u);
  assert.match(html, /500,000원/u);
  assert.match(html, /25%/u);
  assert.match(html, /125,000원/u);
  assert.match(html, /총 RS 수수료/u);
  assert.doesNotMatch(html, /제외 결제자/u);
});

test("유튜브 출연료의 채널별 공급가액과 부가세, 최종 지급액을 정산서 부록으로 만든다", () => {
  const html = youtubeChannelCostAppendixHtml([appearanceFeeCost()]);
  assert.match(html, /유튜브 채널 출연료 \/ RS 비용 상세 내역/u);
  assert.match(html, /초월 &lt;스토리&gt;/u);
  assert.match(html, /연결 채널 · 초월스토리 공식/u);
  assert.match(html, /공급가액/u);
  assert.match(html, /500,000원/u);
  assert.match(html, /50,000원/u);
  assert.match(html, /550,000원/u);
  assert.doesNotMatch(html, /제외 채널/u);
});

test("유튜브 상세 내역이 없는 비용만 있으면 부록을 만들지 않는다", () => {
  assert.equal(youtubeChannelCostAppendixHtml([cost({ calculationDetails: null })]), "");
});
