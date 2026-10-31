import assert from "node:assert/strict";
import test from "node:test";

import { parseCourseCostInput } from "./calculation";
import {
  buildYoutubeAppearanceFeeCostDetails,
  parseYoutubeAppearanceFeeCostDetails,
  youtubeAppearanceFeeTotals,
} from "./youtube-appearance-fee";

test("채널 출연료를 공급가액으로 보고 부가세 10%를 더해 최종 지급액을 계산한다", () => {
  const details = buildYoutubeAppearanceFeeCostDetails(
    [
      { id: "appearance-1", channelName: "초월 스토리", channelUrl: "https://youtube.com/@chowol" },
      { id: "appearance-2", channelName: "꿈꾸는사람들", channelUrl: "" },
      { id: "appearance-3", channelName: "미등록 채널", channelUrl: "" },
    ],
    [
      { channelId: "channel-1", channelName: "초월스토리", channelUrl: "https://youtube.com/@chowol", appearanceFee: 500_000 },
      { channelId: "channel-2", channelName: "꿈꾸는 사람들", channelUrl: "https://youtube.com/@dream", appearanceFee: 300_000 },
    ],
    "2026-10-29T00:00:00.000Z",
  );

  assert.equal(details.channels[0]?.linkedChannelId, "channel-1");
  assert.equal(details.channels[1]?.linkedChannelId, "channel-2");
  assert.equal(details.channels[2]?.linkedChannelId, null);
  assert.equal(details.channels[2]?.included, false);
  assert.deepEqual(youtubeAppearanceFeeTotals(details), {
    channelCount: 2,
    supplyAmount: 800_000,
    vatAmount: 80_000,
    finalAmount: 880_000,
  });
});

test("출연료 생성 항목의 이름, 담당자와 금액은 고정하고 사용자가 옮긴 부담 구분은 보존한다", () => {
  const details = parseYoutubeAppearanceFeeCostDetails({
    kind: "YOUTUBE_APPEARANCE_FEE",
    version: 1,
    calculatedAt: "2026-10-29T00:00:00.000Z",
    channels: [{
      appearanceId: "appearance-1",
      channelName: "초월스토리",
      channelUrl: "",
      linkedChannelId: "channel-1",
      linkedChannelName: "초월스토리",
      linkedChannelUrl: "",
      appearanceFee: 550_000,
      included: true,
    }],
  });

  const parsed = parseCourseCostInput({
    name: "변조된 이름",
    managerName: "변조된 담당자",
    categoryCode: "CUSTOM",
    burdenType: "INSTRUCTOR",
    grossAmount: 1,
    companyShareRate: 0,
    status: "PLANNED",
    calculationDetails: details,
  });

  assert.equal(parsed.name, "유튜브 출연료");
  assert.equal(parsed.managerName, "시스템노바");
  assert.equal(parsed.categoryCode, "YOUTUBE_FIXED");
  assert.equal(parsed.burdenType, "INSTRUCTOR");
  assert.equal(parsed.companyShareRate, 0);
  assert.equal(parsed.instructorShareRate, 100);
  assert.equal(parsed.grossAmount, 605_000);
  assert.equal(parsed.status, "PAID");
  assert.match(parsed.paidDate, /^\d{4}-\d{2}-\d{2}$/u);
});

test("원 단위 공급가액은 채널별 부가세를 반올림해 계산한다", () => {
  const details = parseYoutubeAppearanceFeeCostDetails({
    kind: "YOUTUBE_APPEARANCE_FEE",
    version: 1,
    calculatedAt: "2026-10-29T00:00:00.000Z",
    channels: [
      {
        appearanceId: "appearance-1",
        channelName: "채널 1",
        channelUrl: "",
        linkedChannelId: null,
        linkedChannelName: "",
        linkedChannelUrl: "",
        appearanceFee: 10_005,
        included: true,
      },
      {
        appearanceId: "appearance-2",
        channelName: "채널 2",
        channelUrl: "",
        linkedChannelId: null,
        linkedChannelName: "",
        linkedChannelUrl: "",
        appearanceFee: 10_004,
        included: true,
      },
    ],
  });

  assert.ok(details);
  assert.deepEqual(youtubeAppearanceFeeTotals(details), {
    channelCount: 2,
    supplyAmount: 20_009,
    vatAmount: 2_001,
    finalAmount: 22_010,
  });
});
