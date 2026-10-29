import assert from "node:assert/strict";
import test from "node:test";

import { parseCourseCostInput } from "./calculation";
import {
  buildYoutubeAppearanceFeeCostDetails,
  parseYoutubeAppearanceFeeCostDetails,
  youtubeAppearanceFeeTotals,
} from "./youtube-appearance-fee";

test("출연 유튜브와 관리 채널을 연결해 출연료 합계를 계산한다", () => {
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
  assert.deepEqual(youtubeAppearanceFeeTotals(details), { channelCount: 2, feeAmount: 800_000 });
});

test("출연료 생성 항목의 이름, 담당자, 금액, 부담 구분을 서버에서 고정한다", () => {
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
  assert.equal(parsed.burdenType, "COMPANY");
  assert.equal(parsed.grossAmount, 550_000);
});
