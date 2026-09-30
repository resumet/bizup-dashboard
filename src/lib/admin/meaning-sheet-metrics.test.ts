import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateChatRoomEntries,
  calculateMeaningSheetImportedTotals,
  calculateMeaningSheetUnitCosts,
  formatMeaningSheetSourceCell,
  formatMeaningSheetWon,
  parseMeaningSheetMetricNumber,
  previousMeaningSheetDateKey,
} from "./meaning-sheet-metrics";

test("엑셀의 랜딩 DB와 채널별 오가닉 값을 날짜별 합계로 계산한다", () => {
  const result = calculateMeaningSheetImportedTotals(
    {
      googleLandingDb: 1,
      metaLandingDb: 21,
      organicByChannel: {
        꿈꾸는사람들: 30,
        초월스토리: 5,
      },
    },
    ["꿈꾸는사람들", "초월스토리", "다른날에만등장"],
  );

  assert.deepEqual(result, {
    landing: 22,
    organic: 35,
    database: 57,
  });
});

test("Google 시트의 원화·쉼표 숫자를 계산 가능한 값으로 변환한다", () => {
  assert.equal(parseMeaningSheetMetricNumber("₩468,047"), 468047);
  assert.equal(parseMeaningSheetMetricNumber(" 4,452 "), 4452);
  assert.equal(parseMeaningSheetMetricNumber("₩ -"), null);
  assert.equal(parseMeaningSheetMetricNumber(""), null);
});

test("광고 지표를 원, 건, 퍼센트 단위로 고정해 표시한다", () => {
  assert.equal(formatMeaningSheetSourceCell("₩468,047", 1), "468,047원");
  assert.equal(formatMeaningSheetSourceCell("4,452", 2), "4,452건");
  assert.equal(formatMeaningSheetSourceCell("231", 5), "231건");
  assert.equal(formatMeaningSheetSourceCell("0.36%", 6), "0.36%");
  assert.equal(formatMeaningSheetSourceCell(0.0036, 6), "0.36%");
  assert.equal(formatMeaningSheetSourceCell("₩ -", 10), "-");
  assert.equal(formatMeaningSheetSourceCell("20", 12), "20");
  assert.equal(formatMeaningSheetWon(20000), "20,000원");
  assert.equal(formatMeaningSheetWon(null), "-");
});

test("광고·랜딩 DB 단가와 두 단가의 차이를 매체별로 계산한다", () => {
  const result = calculateMeaningSheetUnitCosts({
    totalAdSpend: 300000,
    googleAdSpend: 100000,
    metaAdSpend: 200000,
    googleAdDb: 20,
    metaAdDb: 40,
    googleLandingDb: 10,
    metaLandingDb: 20,
    chatEntries: 15,
  });

  assert.equal(result.googleAdDbUnitCost, 5000);
  assert.equal(result.metaAdDbUnitCost, 5000);
  assert.equal(result.googleLandingDbUnitCost, 10000);
  assert.equal(result.metaLandingDbUnitCost, 10000);
  assert.equal(result.googleUnitCostDifference, -5000);
  assert.equal(result.metaUnitCostDifference, -5000);
  assert.equal(result.landingReceptionDbUnitCost, 10000);
  assert.equal(result.chatReceptionDbUnitCost, 20000);
});

test("분모가 비어 있거나 0이면 단가를 표시하지 않는다", () => {
  const result = calculateMeaningSheetUnitCosts({
    totalAdSpend: 100000,
    googleAdSpend: 50000,
    metaAdSpend: 50000,
    googleAdDb: 0,
    metaAdDb: null,
    googleLandingDb: null,
    metaLandingDb: null,
    chatEntries: 0,
  });

  assert.equal(result.googleAdDbUnitCost, null);
  assert.equal(result.metaAdDbUnitCost, null);
  assert.equal(result.googleLandingDbUnitCost, null);
  assert.equal(result.metaLandingDbUnitCost, null);
  assert.equal(result.landingReceptionDbUnitCost, null);
  assert.equal(result.chatReceptionDbUnitCost, null);
});

test("톡방입장인원은 오늘 누적인원에서 전날 누적인원을 빼서 계산한다", () => {
  assert.equal(calculateChatRoomEntries(180, 150), 30);
  assert.equal(calculateChatRoomEntries(140, 150), -10);
  assert.equal(calculateChatRoomEntries(180, null), null);
  assert.equal(previousMeaningSheetDateKey("09-30"), "09-29");
  assert.equal(previousMeaningSheetDateKey("01-01"), "12-31");
});
