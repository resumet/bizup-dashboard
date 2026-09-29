import assert from "node:assert/strict";
import test from "node:test";

import { importAdPerformanceSpreadsheet } from "./spreadsheet-import";
import type {
  AdPerformanceDailyMetric,
  AdPerformanceOrganicChannel,
} from "./types";

const channels: AdPerformanceOrganicChannel[] = [
  { id: "00000000-0000-4000-8000-000000000001", name: "꿈꾸사", sortOrder: 1 },
  { id: "00000000-0000-4000-8000-000000000002", name: "초월스토리", sortOrder: 2 },
  { id: "00000000-0000-4000-8000-000000000003", name: "두부", sortOrder: 3 },
  { id: "00000000-0000-4000-8000-000000000004", name: "인스타", sortOrder: 4 },
];

const metric: AdPerformanceDailyMetric = {
  metricDate: "2026-09-28",
  googleImpressions: 0,
  metaImpressions: 0,
  googleClicks: 0,
  metaClicks: 0,
  googleAdLeads: 0,
  metaAdLeads: 0,
  googleSpend: 0,
  metaSpend: 0,
  googleLandingLeads: 0,
  metaLandingLeads: 0,
  adminCumulativeLeads: 0,
  chatRoomMembers: null,
  organicLeads: Object.fromEntries(channels.map((channel) => [channel.id, 0])),
};

function row(cells: string[]) {
  return cells.join("\t");
}

test("선택한 날짜의 엑셀 행만 광고·오가닉 원시값으로 반영한다", () => {
  const headers = Array.from({ length: 25 }, () => "");
  headers[17] = "꿈꾸사";
  headers[18] = "초월 스토리";
  headers[19] = "두부";
  headers[20] = "인스타";
  headers[24] = "톡방 인원";
  const values = [
    "9월28일", "₩468,047", "4,452", "23,040", "16", "231", "0.36%", "1.00%",
    "0.00%", "8.66%", "₩18,659", "₩449,388", "0", "20", "1", "21", "22",
    "30", "5", "0", "2", "37", "59", "242", "148",
  ];
  const spreadsheet = [row(headers), row(values)].join("\n");

  const result = importAdPerformanceSpreadsheet(spreadsheet, metric, channels);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.metric, {
    ...metric,
    googleImpressions: 4_452,
    metaImpressions: 23_040,
    googleClicks: 16,
    metaClicks: 231,
    googleSpend: 18_659,
    metaSpend: 449_388,
    googleAdLeads: 0,
    metaAdLeads: 20,
    googleLandingLeads: 1,
    metaLandingLeads: 21,
    adminCumulativeLeads: 242,
    chatRoomMembers: 148,
    organicLeads: {
      "00000000-0000-4000-8000-000000000001": 30,
      "00000000-0000-4000-8000-000000000002": 5,
      "00000000-0000-4000-8000-000000000003": 0,
      "00000000-0000-4000-8000-000000000004": 2,
    },
  });
  assert.deepEqual(result.importedOrganicChannelNames, ["꿈꾸사", "초월스토리", "두부", "인스타"]);
});

test("선택한 날짜가 없는 표는 기존 입력값을 바꾸지 않는다", () => {
  const result = importAdPerformanceSpreadsheet("9월27일\t₩23,510", metric, channels);

  assert.deepEqual(result, {
    ok: false,
    message: "붙여넣은 표에서 2026-09-28 날짜 행을 찾지 못했습니다.",
  });
});
