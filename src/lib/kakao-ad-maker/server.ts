import "server-only";

import { createHash } from "node:crypto";

import { openai } from "@ai-sdk/openai";
import { APICallError, generateText, Output } from "ai";
import { AD_STRATEGIES, type AdMaterial, type AdProject, type AdStrategy, type StyleProfile } from "./types";
import { getPsychologyPromptLibrary } from "./psychology";
import {
  findUnsupportedClaims,
  materialCopyItemSchema,
  materialCopySchema,
  styleProfileSchema,
  validateAdProject,
} from "./validation";

export const AD_COPY_MODEL = process.env.OPENAI_COPY_MODEL || "gpt-4.1-mini";
export const AD_VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
export const AD_PROMPT_VERSION = "kakao-ad-prompt-maker-v3-psychology";

function ensureApiKey() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API 인증이 없습니다. OPENAI_API_KEY를 .env.local에 설정해 주세요.");
  }
}

function friendlyOpenAiError(error: unknown): never {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401) throw new Error("OpenAI API 키가 올바르지 않습니다.");
    if (error.statusCode === 429) throw new Error("AI 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
    throw new Error(`OpenAI 생성에 실패했습니다. (HTTP ${error.statusCode ?? "unknown"})`);
  }
  throw error;
}

export async function analyzeReferenceImages(project: AdProject) {
  ensureApiKey();
  const references = project.assets.filter(
    (asset) => asset.type === "reference" && asset.enabled !== false,
  ).slice(0, 10);
  if (!references.length) throw new Error("분석할 참고 이미지를 먼저 추가해 주세요.");
  const inputHash = createHash("sha256")
    .update(references.map((asset) => `${asset.dataUrl}:${asset.purpose}:${asset.importance}:${asset.memo}:${asset.applyToStrategies?.join(",")}`).join("|"))
    .update(AD_PROMPT_VERSION)
    .digest("hex");
  if (project.styleProfile?.inputHash === inputHash) return project.styleProfile;

  try {
    const result = await generateText({
      model: openai.responses(AD_VISION_MODEL),
      output: Output.object({
        schema: styleProfileSchema,
        name: "kakao_ad_style_profile",
        description: "참고 광고 이미지에서 복제 가능한 일반 디자인 특성만 추출한 프로필",
      }),
      system: [
        "당신은 한국 카카오 광고 디자인 디렉터입니다.",
        "색감, 정보 계층, 레이아웃, 타이포그래피, 인물·혜택 배치만 분석하세요.",
        "원문의 문구, 고유 로고, 인물의 정체성, 브랜드 고유 그래픽은 복제 대상으로 제안하지 마세요.",
        "색상은 가능한 경우 #RRGGBB 형식으로 제시하세요.",
      ].join("\n"),
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mood: project.mood,
              mandatoryCopy: project.mandatoryCopy,
              prohibitedCopy: project.prohibitedCopy,
              references: references.map((asset, index) => ({
                index: index + 1,
                purpose: asset.purpose || "전체 분위기",
                importance: asset.importance || "보통",
                memo: asset.memo || "",
                applyToStrategies: asset.applyToStrategies?.length ? asset.applyToStrategies : "all",
              })),
            }),
          },
          ...references.map((asset) => ({
            type: "file" as const,
            data: {
              type: "data" as const,
              data: asset.dataUrl.split(",", 2)[1] || "",
            },
            mediaType: asset.mimeType,
            filename: asset.name,
          })),
        ],
      }],
      providerOptions: { openai: { store: false } },
    });
    return {
      ...result.output,
      inputHash,
      enabledFields: ["color", "layout", "typography", "person", "benefit"] as StyleProfile["enabledFields"],
      model: AD_VISION_MODEL,
      analyzedAt: new Date().toISOString(),
    } satisfies StyleProfile;
  } catch (error) {
    friendlyOpenAiError(error);
  }
}

async function requestCopies(project: AdProject, strategies: AdStrategy[], previousWarnings: string[] = []) {
  const enabled = new Set(project.styleProfile?.enabledFields ?? []);
  const styleProfile = project.styleProfile ? {
    summary: project.styleProfile.summary,
    backgroundColors: enabled.has("color") ? project.styleProfile.backgroundColors : [],
    accentColors: enabled.has("color") ? project.styleProfile.accentColors : [],
    layout: enabled.has("layout") ? project.styleProfile.layout : "",
    typography: enabled.has("typography") ? project.styleProfile.typography : "",
    personPlacement: enabled.has("person") ? project.styleProfile.personPlacement : "",
    benefitExpression: enabled.has("benefit") ? project.styleProfile.benefitExpression : "",
  } : null;
  const responseSchema = strategies.length === 5
    ? materialCopySchema
    : materialCopySchema.pick({ materials: true }).extend({
        materials: materialCopyItemSchema.array().length(strategies.length),
      });
  const result = await generateText({
    model: openai.responses(AD_COPY_MODEL),
    output: Output.object({
        schema: responseSchema,
      name: "kakao_ad_materials",
      description: "서로 다른 5개 설득 전략의 홍보 이미지 생성 프롬프트",
    }),
    system: [
      "당신은 한국어 강의 홍보 이미지를 위한 전문 프롬프트 디렉터입니다.",
      `다음 전략을 각각 정확히 하나씩 생성하세요: ${strategies.join(", ")}.`,
      "입력에 없는 수치, 수익, 성과, 이력, 무료 여부, 혜택, 참여 인원을 절대 만들지 마세요.",
      "무조건, 100% 성공, 누구나 돈 번다 같은 보장 표현과 허위 희소성을 사용하지 마세요.",
      "메인 후킹은 모바일 2~3줄 분량, CTA는 행동 동사로 끝내세요.",
      "혜택 입력이 없으면 gift 전략은 강의 참여로 얻게 되는 결과를 중심으로 작성하세요.",
      "메인 후킹 5개는 실질적으로 달라야 하며 입력된 특징 2~3개만 selectedFeatures에 사용하세요.",
      "각 전략의 psychologyLibrary에서 실제 입력과 맞는 심리 기법 2~4개만 선택하고 psychologyTechniques에 코드·이름·적용 방법을 기록하세요.",
      "titleDesign은 PDF 표지·첫 화면에 쓸 제목 설계로, 고객을 주어로 하고 후킹과 핵심 약속을 짧고 구체적으로 설명하세요.",
      "bodyDesign은 PDF 본문·홍보 카피의 흐름으로, 공감 → 문제 → 해결 메커니즘 → 근거 → 혜택 → 행동 순서를 입력 사실에 맞게 설계하세요.",
      "손실회피·권위·사회적 증거·긴급성은 입력된 사실이 있을 때만 사용하고, 불안 조장·강압·허위 희소성·보장 표현은 금지합니다.",
      "제목과 본문에 심리 기법 번호나 전문용어를 노출하지 말고 자연스러운 고객 언어로 구현하세요.",
      "각 imagePrompt는 그대로 이미지 생성 AI에 붙여넣을 수 있는 완성형 한국어 프롬프트여야 합니다.",
      "반드시 1600x900, 16:9 가로형, 정확한 한국어 문구, 대형 타이포, 혜택 2~3개, CTA, 인물과 문구의 배치, 색감과 조명을 구체적으로 지시하세요.",
      "강사 사진이 있으면 '첨부한 강사 사진의 동일 인물과 얼굴·복장·정체성을 유지'라고 명시하고 최대 3명까지만 배치하세요.",
      "imagePrompt 안에 노출할 메인 후킹, 상태·일시, 특징, CTA 문구를 따옴표로 정확히 적고 문구를 변경하지 말라고 지시하세요.",
      "negativePrompt에는 깨진 한글, 임의 문구·로고, 왜곡된 얼굴·손, 중복 인물, 잘린 문구, 정사각형·세로형 구도를 반드시 제외하세요.",
      project.prohibitedCopy ? `다음 문구는 사용하지 마세요: ${project.prohibitedCopy}` : "",
      previousWarnings.length ? `이전 결과의 다음 문제를 모두 수정하세요: ${previousWarnings.join(", ")}` : "",
    ].filter(Boolean).join("\n"),
    prompt: JSON.stringify({
      lectureName: project.lectureName,
      instructorName: project.instructorName,
      lectureDate: project.lectureDate,
      lectureTime: project.lectureTime,
      progressStatus: project.progressStatus,
      features: project.features,
      targetDescription: project.targetDescription,
      instructorHistories: project.instructorHistories.filter(Boolean),
      priceType: project.priceType,
      price: project.price,
      benefits: project.benefits.filter(Boolean),
      applicationDeadline: project.applicationDeadline,
      participantCount: project.participantCount,
      mood: project.mood,
      mandatoryCopy: project.mandatoryCopy,
      assets: project.assets.map((asset) => ({
        type: asset.type,
        name: asset.name,
        isPrimary: asset.isPrimary,
        purpose: asset.purpose || "",
        memo: asset.memo || "",
        applyToStrategies: asset.applyToStrategies || [],
      })),
      styleProfile,
      requestedStrategies: strategies,
      psychologyLibrary: getPsychologyPromptLibrary(strategies),
    }, null, 2),
    providerOptions: { openai: { store: false } },
  });
  return result.output.materials;
}

export async function generateAdMaterials(project: AdProject, strategy?: AdStrategy) {
  ensureApiKey();
  const validation = validateAdProject(project);
  if (!validation.success) throw new Error(validation.error.issues[0]?.message || "입력값을 확인해 주세요.");

  try {
    const strategies = strategy ? [strategy] : [...AD_STRATEGIES];
    let warnings: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const copies = await requestCopies(project, strategies, warnings);
      warnings = copies.flatMap((copy) => {
        const text = [copy.mainHook, copy.subCopy, copy.statusBadge, copy.cta].join("\n");
        const unsupported = findUnsupportedClaims(text, project);
        const prohibited = project.prohibitedCopy
          .split(/[\n,]/u)
          .map((item) => item.trim())
          .filter((item) => item && text.includes(item))
          .map((item) => `금지 문구: ${item}`);
        return [...unsupported, ...prohibited];
      });
      if (copies.length > 1) {
        const uniqueHooks = new Set(copies.map((copy) => copy.mainHook.replace(/\s/gu, "")));
        if (uniqueHooks.size !== copies.length) warnings.push("메인 후킹이 서로 중복됨");
      }
      if (!warnings.length) {
        return copies.map((copy) => ({ id: crypto.randomUUID(), ...copy } satisfies AdMaterial));
      }
    }
    throw new Error(`입력하지 않은 사실 또는 위험 표현이 감지되어 저장하지 않았습니다: ${[...new Set(warnings)].join(", ")}`);
  } catch (error) {
    friendlyOpenAiError(error);
  }
}
