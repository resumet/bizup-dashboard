import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeRosterOptions,
  analyzeRosterSources,
  countGroupChatParticipants,
  filterGroupChatNonParticipants,
  filterRosterRows,
  sortRosterRows,
} from "./filter";
import { EMPTY_ROSTER_FILTERS, type RosterRow } from "./types";

const rows = [
  {
    id: "1",
    sourceRowNumber: 2,
    normalizedPhone: "01011112222",
    isDuplicate: false,
    groupChatJoined: true,
    values: {
      courseName: "AI 실전",
      optionName: "A",
      customerName: "홍길동",
      email: "hong@example.com",
      phone: "01011112222",
      referrer: "김추천",
      source: "검색",
      adMedia: "네이버",
    },
  },
  {
    id: "2",
    sourceRowNumber: 3,
    normalizedPhone: "01033334444",
    isDuplicate: false,
    groupChatJoined: false,
    values: {
      courseName: "AI 실전",
      optionName: "B",
      customerName: "김영희",
      email: "kim@example.com",
      phone: "01033334444",
      referrer: "",
      source: "SNS",
      adMedia: "인스타그램",
    },
  },
] satisfies RosterRow[];

test("화면과 서버에서 공유하는 명단 필터가 검색어와 선택 조건을 함께 적용한다", () => {
  assert.equal(
    filterRosterRows(rows, {
      ...EMPTY_ROSTER_FILTERS,
      keyword: "홍길",
      source: "검색",
    }).length,
    1,
  );
  assert.equal(
    filterRosterRows(rows, {
      ...EMPTY_ROSTER_FILTERS,
      optionName: "B",
      adMedia: "인스타그램",
    })[0].id,
    "2",
  );
  assert.equal(
    filterRosterRows(rows, { ...EMPTY_ROSTER_FILTERS, keyword: "없는 사람" })
      .length,
    0,
  );
});

test("단톡방 입장 안한 사람만 명단에서 필터링한다", () => {
  assert.deepEqual(
    filterRosterRows(rows, {
      ...EMPTY_ROSTER_FILTERS,
      groupChat: "notJoined",
    }).map((row) => row.id),
    ["2"],
  );
  assert.equal(filterRosterRows(rows, EMPTY_ROSTER_FILTERS).length, 2);
});

test("단톡방 미참여자만 발송 대상으로 남긴다", () => {
  assert.deepEqual(
    filterGroupChatNonParticipants(rows, true).map((row) => row.id),
    ["2"],
  );
  assert.equal(filterGroupChatNonParticipants(rows, false).length, 2);
});

test("단톡방 참여 인원만 정확하게 집계한다", () => {
  assert.equal(countGroupChatParticipants(rows), 1);
  assert.equal(countGroupChatParticipants([]), 0);
});

test("수강생을 이름 오름차순·내림차순으로 정렬하고 원래 순서로 복원한다", () => {
  const reversed = [rows[1], rows[0]];
  assert.deepEqual(
    sortRosterRows(reversed, "nameAsc").map((row) => row.values.customerName),
    ["김영희", "홍길동"],
  );
  assert.deepEqual(
    sortRosterRows(reversed, "nameDesc").map((row) => row.values.customerName),
    ["홍길동", "김영희"],
  );
  assert.deepEqual(
    sortRosterRows(reversed, "original").map((row) => row.id),
    ["1", "2"],
  );
});

test("유입 경로별 인원과 비율을 집계하고 빈 값은 미분류로 표시한다", () => {
  const analysisRows = [
    ...rows,
    {
      ...rows[0],
      id: "3",
      sourceRowNumber: 4,
      values: { ...rows[0].values, source: "검색" },
    },
    {
      ...rows[0],
      id: "4",
      sourceRowNumber: 5,
      values: { ...rows[0].values, source: "" },
    },
  ];

  assert.deepEqual(analyzeRosterSources(analysisRows), [
    { source: "검색", count: 2, percentage: 50 },
    { source: "미분류", count: 1, percentage: 25 },
    { source: "SNS", count: 1, percentage: 25 },
  ]);
  assert.deepEqual(analyzeRosterSources([]), []);
});

test("옵션별 인원과 비율을 집계하고 빈 옵션은 미분류로 표시한다", () => {
  const analysisRows = [
    ...rows,
    {
      ...rows[0],
      id: "3",
      sourceRowNumber: 4,
      values: { ...rows[0].values, optionName: "A" },
    },
    {
      ...rows[0],
      id: "4",
      sourceRowNumber: 5,
      values: { ...rows[0].values, optionName: "" },
    },
  ];

  assert.deepEqual(analyzeRosterOptions(analysisRows), [
    { optionName: "A", count: 2, percentage: 50 },
    { optionName: "미분류", count: 1, percentage: 25 },
    { optionName: "B", count: 1, percentage: 25 },
  ]);
  assert.deepEqual(analyzeRosterOptions([]), []);
});
