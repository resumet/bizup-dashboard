import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadLocalEnvironment() {
  const contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of contents.split(/\r?\n/u)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/u);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

async function main() {
  loadLocalEnvironment();
  const [{ createEmptyAdProject }, { generateAdMaterials }] = await Promise.all([
    import("../src/lib/kakao-ad-maker/types"),
    import("../src/lib/kakao-ad-maker/server"),
  ]);
  const project = {
    ...createEmptyAdProject(),
    lectureName: "AI 음악 유튜브로 꾸준한 부수입 만들기",
    instructorName: "애니한",
    lectureDate: "2026-09-05",
    lectureTime: "10:30",
    progressStatus: "모집 중" as const,
    features: [
      "프로그램으로 고품질 AI 음악 제작",
      "조회수와 음원 수익을 함께 설계",
      "초보자도 따라 하는 실습형 강의",
      "프로그램 무료 체험권 제공",
      "실제 유튜브 운영 사례 공개",
    ],
    targetDescription: "얼굴 공개나 복잡한 편집 없이 퇴근 후 온라인 부수입을 만들고 싶은 직장인",
    instructorHistories: ["11년 차 AI 음악 전문가", "유튜브 구독자 100만 채널 운영"],
    benefits: ["프로그램 무료 체험권"],
  };
  const materials = await generateAdMaterials(project);
  console.log(JSON.stringify({
    count: materials.length,
    strategies: materials.map((material) => material.strategy),
    uniqueHooks: new Set(materials.map((material) => material.mainHook)).size,
    uniquePrompts: new Set(materials.map((material) => material.imagePrompt)).size,
    landscapePrompts: materials.every((material) => material.aspectRatio === "16:9" && material.outputSize === "1600x900"),
    psychologyApplied: materials.every((material) => material.psychologyTechniques.length >= 2 && material.titleDesign.length > 0 && material.bodyDesign.length > 0),
  }));
}

void main();
