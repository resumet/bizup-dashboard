import assert from "node:assert/strict";
import test from "node:test";

import { AD_STRATEGIES, createEmptyAdProject } from "./types";
import { findUnsupportedClaims, materialCopySchema, validateAdProject } from "./validation";

function validProject() {
  return {
    ...createEmptyAdProject(),
    lectureName: "AI 음악 수익화",
    instructorName: "애니한",
    lectureDate: "2026-09-05",
    features: ["음악 제작", "수익 설계", "초보 실습", "무료 체험", "운영 사례"],
    targetDescription: "퇴근 후 부수입을 만들 직장인",
    instructorHistories: ["11년 차 AI 음악 전문가"],
  };
}

test("5개 전략의 16:9 홍보소재 생성 프롬프트를 구조화한다", () => {
  const result = materialCopySchema.safeParse({
    materials: AD_STRATEGIES.map((strategy) => ({
      strategy,
      mainHook: "핵심 후킹",
      subCopy: "보조 카피",
      selectedFeatures: ["특징 1", "특징 2"],
      instructorProof: ["강사 이력"],
      statusBadge: "오늘 오후 7시 30분",
      cta: "지금 바로 신청하세요",
      psychologyTechniques: [
        { code: "025", name: "내 얘기 효과", application: "타깃의 고민을 제목에 사용" },
        { code: "036", name: "구체성", application: "입력된 일정과 혜택을 구체화" },
      ],
      titleDesign: "고객을 주어로 하고 결과를 앞에 배치",
      bodyDesign: "고민, 해결 방법, 혜택, CTA 순으로 설계",
      visualDirection: "대형 한글 타이포와 강사 사진을 좌우로 배치",
      imagePrompt: "1600x900, 16:9 가로형 한국어 강의 홍보 배너를 생성하세요.",
      negativePrompt: "깨진 한글, 왜곡된 얼굴, 중복 인물 금지",
      aspectRatio: "16:9",
      outputSize: "1600x900",
      riskFlags: [],
    })),
  });
  assert.equal(result.success, true);
});

test("필수 입력과 특징 정확히 5개를 검증한다", () => {
  assert.equal(validateAdProject(validProject()).success, true);
  assert.equal(validateAdProject({ ...validProject(), features: ["하나"] }).success, false);
});

test("입력하지 않은 인원·무료·증정과 위험 표현을 감지한다", () => {
  const warnings = findUnsupportedClaims(
    "누구나 돈 번다. 무료특강에 700명 참여, 선물도 드립니다.",
    validProject(),
  );
  assert.ok(warnings.includes("누구나 돈"));
  assert.ok(warnings.includes("입력하지 않은 참여 인원"));
  assert.ok(warnings.includes("입력하지 않은 무료 여부"));
  assert.ok(warnings.includes("입력하지 않은 증정 혜택"));
});
