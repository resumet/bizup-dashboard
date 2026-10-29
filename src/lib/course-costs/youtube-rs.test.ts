import assert from "node:assert/strict";
import test from "node:test";

import {
  buildYoutubeRsCostDetails,
  parseYoutubeRsCostDetails,
  youtubeRsMatchScore,
  youtubeRsTotals,
} from "./youtube-rs";
import { parseCourseCostInput } from "./calculation";

test("RS 이름은 공백·기호·조사 차이를 허용해 채널별로 한 번만 매칭한다", () => {
  assert.ok(youtubeRsMatchScore("꿈꾸는 사람들이", "꿈꾸는사람들") > 0);
  assert.ok(youtubeRsMatchScore("초월 스토리", "초월스토리") > 0);
  assert.equal(youtubeRsMatchScore("초월스토리", "다른 채널"), 0);

  const details = buildYoutubeRsCostDetails(
    [
      { id: "appearance-a", channelName: "초월스토리", channelUrl: "https://youtube.test/a" },
      { id: "appearance-b", channelName: "꿈꾸는사람들", channelUrl: "https://youtube.test/b" },
    ],
    [
      { channelId: "a", channelName: "초월스토리", channelUrl: "https://youtube.test/a", rsPercent: 20 },
      { channelId: "b", channelName: "꿈꾸는 사람들", channelUrl: "https://youtube.test/b", rsPercent: 30 },
    ],
    [
      { id: "order-a", name: "김가람", rsLabel: "초월 스토리", currentAmount: 100_000, status: "결제완료" },
      { id: "order-b", name: "이누리", rsLabel: "꿈꾸는 사람들이", currentAmount: 200_000, status: " 결제완료 " },
      { id: "order-c", name: "환불", rsLabel: "초월스토리", currentAmount: 0, status: "전액환불" },
    ],
    "2026-10-29T00:00:00.000Z",
  );

  assert.deepEqual(details.channels.map((channel) => ({
    name: channel.channelName,
    percent: channel.rsPercent,
    payers: channel.payers.map((payer) => payer.name),
  })), [
    { name: "초월스토리", percent: 20, payers: ["김가람"] },
    { name: "꿈꾸는사람들", percent: 30, payers: ["이누리"] },
  ]);
  assert.deepEqual(youtubeRsTotals(details), { payerCount: 2, paymentAmount: 300_000, feeAmount: 80_000 });
});

test("저장할 상세 내역은 서버에서 수수료를 다시 계산한다", () => {
  const parsed = parseYoutubeRsCostDetails({
    kind: "YOUTUBE_RS",
    version: 1,
    calculatedAt: "2026-10-29T00:00:00.000Z",
    channels: [{
      appearanceId: "appearance-a",
      channelName: "초월스토리",
      channelUrl: "",
      rsPercent: 25,
      payers: [{ orderId: "order-a", name: "김가람", rsLabel: "초월스토리", paymentAmount: 100_000, feeAmount: 1, included: true }],
    }],
  });
  assert.equal(parsed?.channels[0].payers[0].feeAmount, 25_000);

  const input = parseCourseCostInput({
    name: "변조한 이름",
    managerName: "변조한 담당자",
    grossAmount: 1,
    burdenType: "SHARED",
    companyShareRate: 50,
    status: "PLANNED",
    calculationDetails: parsed,
  });
  assert.deepEqual({ name: input.name, manager: input.managerName, amount: input.grossAmount }, {
    name: "유튜브 RS",
    manager: "유튜브",
    amount: 25_000,
  });
});
