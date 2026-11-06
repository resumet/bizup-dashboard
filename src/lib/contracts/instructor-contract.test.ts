import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  formatContractAmountInKorean,
  formatContractNumber,
  getContractEndDate,
  getKoreanDate,
  renderInstructorContractTemplate,
  type InstructorContractTemplate,
  type InstructorContractValues,
} from "./instructor-contract";
import { parseInstructorContractTemplate } from "./instructor-contract-validation";

const values: InstructorContractValues = {
  instructorName: "윤지혜",
  lectureName: "인스타그램 실전",
  instagramNumberOfReels: "12",
  instagramValueOfReels: "1500000",
  contractDate: "2026-11-06",
  startDate: "2026-11-06",
  durationYears: 1,
  address: "서울시 강남구",
  phone: "010-1234-5678",
  email: "test@example.com",
};

test("계약 종료일은 시작일 기준 입력한 연수를 더한다", () => {
  assert.equal(getContractEndDate("2026-11-05", 1), "2027-11-05");
  assert.equal(getContractEndDate("2024-02-29", 1), "2025-03-01");
});

test("계약 날짜를 읽기 쉬운 한국어 날짜로 표시한다", () => {
  assert.equal(getKoreanDate("2026-11-05"), "2026년 11월 5일");
});

test("인스타그램 릴스 대행 금액을 쉼표와 한글 금액으로 표시한다", () => {
  assert.equal(formatContractNumber("1500000"), "1,500,000");
  assert.equal(formatContractNumber("1,500,000원"), "1,500,000");
  assert.equal(formatContractAmountInKorean("1500000"), "백오십만 원");
  assert.equal(formatContractAmountInKorean("100000000"), "일억 원");
  assert.equal(formatContractAmountInKorean("0"), "영 원");
});

test("기존 조항형 템플릿은 전체 원문 편집 형식으로 변환한다", () => {
  const template = parseInstructorContractTemplate({
    introduction: "계약 서문",
    sections: [{ title: "제1조", paragraphs: ["첫 번째 조항"] }],
  });

  assert.equal(template?.version, 2);
  assert.equal(template?.content.some((block) => block.type === "heading1"), true);
  assert.equal(template?.content.some((block) => block.type === "rich_text" && block.content.type === "table"), true);
  assert.equal(template?.content.some((block) => block.type === "paragraph" && block.content === "① 첫 번째 조항"), true);
});

test("계약서 원문의 줄바꿈과 연속 공백을 유지하면서 변수를 바꾼다", () => {
  const template: InstructorContractTemplate = {
    version: 2,
    content: [{
      id: "00000000-0000-4000-8000-000000000001",
      type: "paragraph",
      content: "  {{instructorName}}  님\n강의명:  {{lectureName}}  ",
    }],
  };

  const parsed = parseInstructorContractTemplate(template);
  assert.ok(parsed);
  assert.equal(parsed.content[0]?.type === "paragraph" ? parsed.content[0].content : "", "  {{instructorName}}  님\n강의명:  {{lectureName}}  ");
  const [rendered] = renderInstructorContractTemplate(parsed, values);
  assert.equal(rendered.type, "paragraph");
  if (rendered.type !== "paragraph") return;
  assert.equal(rendered.content, "  윤지혜  님\n강의명:  인스타그램 실전  ");
});

test("인스타그램 릴스 대행 갯수와 금액 변수를 입력값으로 바꾼다", () => {
  const template: InstructorContractTemplate = {
    version: 2,
    content: [{
      id: "00000000-0000-4000-8000-000000000001",
      type: "rich_text",
      content: {
        type: "paragraph",
        content: [{
          type: "text",
          text: "릴스 대행: {{instagram_number_of_reels}}개\n대행 금액: {{instagram_value_of_reels}}원",
        }],
      },
    }],
  };

  const [rendered] = renderInstructorContractTemplate(template, values);
  assert.equal(rendered.type, "rich_text");
  if (rendered.type !== "rich_text") return;
  assert.equal(rendered.content.content?.[0]?.text, "릴스 대행: 12개\n대행 금액: 1,500,000원");
});

test("기본 템플릿은 전체 본문과 입력 변수 영역을 포함한다", () => {
  const rendered = renderInstructorContractTemplate(DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE, values);
  assert.equal(rendered.length > 20, true);
  assert.equal(JSON.stringify(rendered).includes("윤지혜"), true);
  assert.equal(JSON.stringify(rendered).includes("2026년 11월 6일 ~ 2027년 11월 6일"), true);
});

test("작성 날짜 변수를 입력 날짜로 바꾼다", () => {
  const template: InstructorContractTemplate = {
    version: 2,
    content: [{
      id: "00000000-0000-4000-8000-000000000001",
      type: "paragraph",
      content: "작성일: {{contract_date}}",
    }],
  };
  const [rendered] = renderInstructorContractTemplate(template, values);
  assert.equal(rendered.type, "paragraph");
  if (rendered.type !== "paragraph") return;
  assert.equal(rendered.content, "작성일: 2026년 11월 6일");
});
