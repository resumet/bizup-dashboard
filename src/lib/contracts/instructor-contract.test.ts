import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_INSTRUCTOR_CONTRACT_TEMPLATE,
  formatContractAmountInKorean,
  formatContractNumber,
  getContractEndDate,
  getKoreanDate,
  getKoreanDateWithWeekday,
  getInstructorContractTemplateVariables,
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
  customValues: { instructorFee: "1500000" },
};

test("계약 종료일은 시작일 기준 입력한 연수를 더한다", () => {
  assert.equal(getContractEndDate("2026-11-05", 1), "2027-11-05");
  assert.equal(getContractEndDate("2024-02-29", 1), "2025-03-01");
});

test("계약 날짜를 읽기 쉬운 한국어 날짜로 표시한다", () => {
  assert.equal(getKoreanDate("2026-11-05"), "2026년 11월 5일");
  assert.equal(getKoreanDateWithWeekday("2026-11-06"), "2026년 11월 06일(금)");
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

  const [rendered] = renderInstructorContractTemplate(template, { ...values, customValues: { paymentCode: "P-100" } });
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
  const [rendered] = renderInstructorContractTemplate(template, { ...values, customValues: { paymentCode: "P-100" } });
  assert.equal(rendered.type, "paragraph");
  if (rendered.type !== "paragraph") return;
  assert.equal(rendered.content, "작성일: 2026년 11월 06일(금)");
});

test("작성 날짜는 사용자 정의 변수에 같은 키가 있어도 요일을 포함한 계약 날짜로 표시한다", () => {
  const template: InstructorContractTemplate = {
    version: 2,
    content: [{
      id: "00000000-0000-4000-8000-000000000001",
      type: "paragraph",
      content: "작성일: {{contract_date}}",
    }],
  };
  const [rendered] = renderInstructorContractTemplate(template, {
    ...values,
    contractDate: "2026-11-12",
    customValues: { contract_date: "2026-11-12" },
  });
  assert.equal(rendered.type, "paragraph");
  if (rendered.type !== "paragraph") return;
  assert.equal(rendered.content, "작성일: 2026년 11월 12일(목)");
});

test("계약서 본문과 리치텍스트 안의 모든 사용자 변수를 수집하고 치환한다", () => {
  const template: InstructorContractTemplate = {
    version: 2,
    content: [{
      id: "00000000-0000-4000-8000-000000000001",
      type: "rich_text",
      content: { type: "paragraph", content: [{ type: "text", text: "수수료 {{ instructorFee }} / {{paymentDate}}" }] },
    }, {
      id: "00000000-0000-4000-8000-000000000002",
      type: "paragraph",
      content: "정산일 {{paymentDate}}",
    }],
  };

  assert.deepEqual(getInstructorContractTemplateVariables(template), [
    { name: "instructorFee" },
    { name: "paymentDate" },
  ]);
  const [rendered] = renderInstructorContractTemplate(template, { ...values, customValues: { instructorFee: "1,500,000원", paymentDate: "매월 10일" } });
  assert.equal(JSON.stringify(rendered).includes("1,500,000원 / 매월 10일"), true);
});

test("변수 라벨은 첫 등장한 라벨만 사용하고 라벨 없는 첫 등장은 유지한다", () => {
  const template: InstructorContractTemplate = {
    version: 2,
    content: [{
      id: "00000000-0000-4000-8000-000000000001",
      type: "paragraph",
      content: "{{계약일, contract_date}} {{다른 계약일, contract_date}} {{paymentCode}} {{결제 코드, paymentCode}}",
    }],
  };
  assert.deepEqual(getInstructorContractTemplateVariables(template), [
    { name: "contract_date", label: "계약일" },
    { name: "paymentCode" },
  ]);
  const [rendered] = renderInstructorContractTemplate(template, { ...values, customValues: { paymentCode: "P-100" } });
  assert.equal(rendered.type, "paragraph");
  if (rendered.type !== "paragraph") return;
  assert.equal(rendered.content.includes("{{"), false);
});

test("입력한 변수값은 라벨 표기를 포함한 계약서 토큰 전체를 대체한다", () => {
  const template: InstructorContractTemplate = {
    version: 2,
    content: [{
      id: "00000000-0000-4000-8000-000000000001",
      type: "paragraph",
      content: "계약 {{계약기간, contractPeriod}}",
    }],
  };
  const [rendered] = renderInstructorContractTemplate(template, { ...values, customValues: { contractPeriod: "2026년 11월 1일 ~ 2027년 10월 31일" } });
  assert.equal(rendered.type, "paragraph");
  if (rendered.type !== "paragraph") return;
  assert.equal(rendered.content, "계약 2026년 11월 1일 ~ 2027년 10월 31일");
});

test("문서 링크 주소에 있는 변수도 입력값으로 치환한다", () => {
  const template: InstructorContractTemplate = {
    version: 2,
    content: [{
      id: "00000000-0000-4000-8000-000000000001",
      type: "link",
      label: "정산 안내",
      url: "https://example.com/{{paymentCode}}",
    }],
  };
  const [rendered] = renderInstructorContractTemplate(template, { ...values, customValues: { paymentCode: "abc-123" } });
  assert.equal(rendered.type, "link");
  if (rendered.type !== "link") return;
  assert.equal(rendered.url, "https://example.com/abc-123");
});
