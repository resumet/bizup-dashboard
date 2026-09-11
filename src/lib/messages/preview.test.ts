import assert from "node:assert/strict";
import test from "node:test";
import { buildRecipientTemplateVariables } from "./custom-template";
import { renderMessagePreview } from "./preview";

for (const [aliases, value] of [
  [["링크", "링크명", "입장링크"], "https://example.com/join?name=$&"],
  [["강의명", "신청강좌", "강좌명"], "AI 실전 강의"],
] as const) {
  test(`${aliases.join("·")}은 모든 방향으로 치환된다`, () => {
    const body = aliases.map((alias) => `#{${alias}}`).join("\n");
    for (const source of aliases) {
      assert.deepEqual(renderMessagePreview(body, { [source]: value }), {
        content: [value, value, value].join("\n"),
        missingVariables: [],
      });
    }
  });

  test(`${aliases.join("·")}은 일치하는 값을 우선하고 빈 별칭을 건너뛴다`, () => {
    const [first, second, third] = aliases;
    assert.equal(renderMessagePreview(`#{${second}}`, { [first]: "다른 값", [second]: value }).content, value);
    assert.equal(renderMessagePreview(`#{${first}}`, { [first]: "", [second]: "", [third]: value }).content, value);
    assert.deepEqual(renderMessagePreview(`#{${first}}`, { [second]: "", [third]: "" }), {
      content: `#{${first}}`,
      missingVariables: [first],
    });
  });
}

test("서로 다른 변수 그룹의 값은 교차 적용하지 않는다", () => {
  assert.deepEqual(renderMessagePreview("#{입장링크} #{신청강좌}", { 고객명: "홍길동" }), {
    content: "#{입장링크} #{신청강좌}",
    missingVariables: ["입장링크", "신청강좌"],
  });
});

test("고객별 이름과 공통 값을 본문에 적용하고 줄바꿈과 반복 변수를 보존한다", () => {
  const body = "#{고객명}님 안녕하세요.\n#{강좌명}: #{링크명}\n#{고객명}님 감사합니다.";
  for (const name of ["홍길동", "김영희"]) {
    const variables = buildRecipientTemplateVariables({ 강좌명: "AI 강의", 링크명: "https://example.com/$&" }, ["고객명"], name);
    assert.deepEqual(renderMessagePreview(body, variables), {
      content: `${name}님 안녕하세요.\nAI 강의: https://example.com/$&\n${name}님 감사합니다.`,
      missingVariables: [],
    });
  }
});

test("없는 값과 빈 이름은 치환하지 않고 누락 변수로 표시한다", () => {
  assert.deepEqual(renderMessagePreview("#{고객명} #{링크} #{링크} #{toString}", { 고객명: "" }), {
    content: "#{고객명} #{링크} #{링크} #{toString}",
    missingVariables: ["고객명", "링크", "toString"],
  });
});

test("치환 값 안의 변수 표기는 재치환하지 않는다", () => {
  assert.equal(renderMessagePreview("#{고객명}", { 고객명: "#{강좌명}", 강좌명: "강의" }).content, "#{강좌명}");
});

test("이름과 고객명은 양방향으로 같은 수신자 변수에 연결된다", () => {
  for (const variable of ["이름", "고객명"]) {
    const variables = buildRecipientTemplateVariables({}, [variable], "홍길동");
    assert.deepEqual(renderMessagePreview("#{이름}님 / #{고객명}님", variables), {
      content: "홍길동님 / 홍길동님",
      missingVariables: [],
    });
  }
});

test("이름과 고객명 값이 모두 있으면 각각 일치하는 값을 우선한다", () => {
  assert.deepEqual(renderMessagePreview("#{이름} / #{고객명}", { 이름: "홍길동", 고객명: "김영희" }), {
    content: "홍길동 / 김영희",
    missingVariables: [],
  });
});

test("이름 또는 고객명이 비어 있으면 반대쪽 값을 사용하고 둘 다 비면 누락으로 표시한다", () => {
  for (const variables of [{ 이름: "", 고객명: "홍길동" }, { 이름: "홍길동", 고객명: "" }]) {
    assert.deepEqual(renderMessagePreview("#{이름} / #{고객명}", variables), {
      content: "홍길동 / 홍길동",
      missingVariables: [],
    });
  }
  assert.deepEqual(renderMessagePreview("#{이름} / #{고객명}", { 이름: "", 고객명: "" }), {
    content: "#{이름} / #{고객명}",
    missingVariables: ["이름", "고객명"],
  });
});
