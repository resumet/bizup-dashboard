import assert from "node:assert/strict";
import test from "node:test";

import {
  extractAssignedTaskTitle,
  findActiveMention,
  insertMention,
} from "./tasks";

test("@ 입력은 영문자나 숫자 뒤가 아닐 때만 사용자 언급을 시작한다", () => {
  assert.deepEqual(findActiveMention("할일 @윤", 5), { start: 3, end: 5, query: "윤" });
  assert.equal(findActiveMention("staff@bizup.co", 9), null);
  assert.equal(findActiveMention("1@윤", 3), null);
  assert.deepEqual(findActiveMention("업무(@윤", 5), { start: 3, end: 5, query: "윤" });
});

test("사용자 선택은 현재 언급 검색어만 이름으로 바꾼다", () => {
  const mention = findActiveMention("오늘 @윤 자료", 5);
  assert.ok(mention);
  assert.deepEqual(insertMention("오늘 @윤 자료", mention, "윤지혜"), {
    value: "오늘 @윤지혜 자료",
    cursor: 8,
  });
});

test("배정 문구에서 선택한 사용자 언급만 제거해 할일 제목을 만든다", () => {
  assert.deepEqual(extractAssignedTaskTitle("@윤지혜 인스타그램 릴스 수집해", ["윤지혜"]), {
    name: "윤지혜",
    title: "인스타그램 릴스 수집해",
  });
  assert.deepEqual(extractAssignedTaskTitle("오늘 @윤지혜 자료 확인", ["윤지혜"]), {
    name: "윤지혜",
    title: "오늘 자료 확인",
  });
  assert.equal(extractAssignedTaskTitle("staff@bizup.co 확인", ["bizup"]), null);
  assert.equal(extractAssignedTaskTitle("@윤지혜", ["윤지혜"]), null);
});
