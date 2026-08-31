import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecipientTemplateVariables,
  getTemplateInputVariables,
  getTemplateVariables,
  parseTemplateVariableValues,
} from "./custom-template";

test("템플릿에서 수신자 이름을 제외한 입력 변수를 추출한다", () => {
  assert.deepEqual(getTemplateInputVariables("신청자", "강좌명"), ["강좌명"]);
  assert.deepEqual(getTemplateInputVariables("이름", "이름"), []);
});

test("전체 템플릿 변수에는 신청자 변수를 포함하고 중복을 제거한다", () => {
  assert.deepEqual(
    getTemplateVariables("신청자", ["신청자", "강의시간", "링크명"]),
    ["신청자", "강의시간", "링크명"],
  );
});

test("템플릿 변수 입력을 검증하고 수신자 이름을 자동 적용한다", () => {
  const input = parseTemplateVariableValues({ 강좌명: " AI 자동화 " }, [
    "강좌명",
  ]);
  assert.deepEqual(buildRecipientTemplateVariables(input, "신청자", "권정인"), {
    강좌명: "AI 자동화",
    신청자: "권정인",
  });
  assert.throws(() => parseTemplateVariableValues({}, ["강좌명"]), /강좌명/);
});

test("선택한 여러 이름 변수에 수신자 이름을 적용한다", () => {
  assert.deepEqual(
    buildRecipientTemplateVariables(
      { 강의시간: "오후 7시" },
      ["신청자", "성함"],
      "권정인",
    ),
    { 강의시간: "오후 7시", 신청자: "권정인", 성함: "권정인" },
  );
});
