import { z } from "zod";

import { AD_STRATEGIES, PROGRESS_STATUSES, type AdProject } from "./types";

export const adProjectInputSchema = z.object({
  lectureName: z.string().trim().min(1, "강의명을 입력해 주세요."),
  instructorName: z.string().trim().min(1, "강사명을 입력해 주세요."),
  lectureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "강의 날짜를 입력해 주세요."),
  lectureTime: z.string().regex(/^\d{2}:\d{2}$/u, "강의 시간을 입력해 주세요."),
  progressStatus: z.enum(PROGRESS_STATUSES),
  features: z.array(z.string().trim().min(1, "특징을 입력해 주세요.")).length(5, "특징은 정확히 5개가 필요합니다."),
  targetDescription: z.string().trim().min(1, "핵심 타깃을 입력해 주세요."),
  instructorHistories: z.array(z.string().trim().min(1)).min(1, "강사 이력을 한 개 이상 입력해 주세요."),
  benefits: z.array(z.string()),
  participantCount: z.string(),
  mandatoryCopy: z.string(),
  prohibitedCopy: z.string(),
});

export const materialCopyItemSchema = z.object({
    strategy: z.enum(AD_STRATEGIES),
    mainHook: z.string().trim().min(1),
    subCopy: z.string().trim().min(1),
    selectedFeatures: z.array(z.string().trim().min(1)).min(2).max(3),
    instructorProof: z.array(z.string().trim().min(1)).max(3),
    statusBadge: z.string().trim().min(1),
    cta: z.string().trim().min(1),
    psychologyTechniques: z.array(z.object({
      code: z.string().regex(/^\d{3}$/u),
      name: z.string().trim().min(1),
      application: z.string().trim().min(1),
    })).min(2).max(4),
    titleDesign: z.string().trim().min(1),
    bodyDesign: z.string().trim().min(1),
    visualDirection: z.string().trim().min(1),
    imagePrompt: z.string().trim().min(20),
    negativePrompt: z.string().trim().min(10),
    aspectRatio: z.literal("16:9"),
    outputSize: z.literal("1600x900"),
    riskFlags: z.array(z.string()),
  });

export const materialCopySchema = z.object({
  materials: z.array(materialCopyItemSchema).length(5),
}).superRefine((value, context) => {
  const strategies = new Set(value.materials.map((material) => material.strategy));
  for (const strategy of AD_STRATEGIES) {
    if (!strategies.has(strategy)) context.addIssue({
      code: "custom",
      message: `${strategy} 전략이 없습니다.`,
      path: ["materials"],
    });
  }
});

export const styleProfileSchema = z.object({
  summary: z.string(),
  backgroundColors: z.array(z.string()).max(5),
  accentColors: z.array(z.string()).max(5),
  layout: z.string(),
  typography: z.string(),
  personPlacement: z.string(),
  benefitExpression: z.string(),
  excludedElements: z.array(z.string()),
});

const RISKY_PATTERNS = [/무조건/gu, /100\s*%\s*성공/giu, /누구나\s*(?:돈|수익)/gu];

export function validateAdProject(project: AdProject) {
  return adProjectInputSchema.safeParse({
    ...project,
    instructorHistories: project.instructorHistories.filter(Boolean),
    benefits: project.benefits.filter(Boolean),
  });
}

export function findUnsupportedClaims(text: string, project: AdProject) {
  const warnings = RISKY_PATTERNS.flatMap((pattern) => text.match(pattern) ?? []);
  if (!project.participantCount && /\d[\d,]*\s*명/u.test(text)) warnings.push("입력하지 않은 참여 인원");
  if (project.priceType !== "무료" && /무료\s*(?:강의|특강)/u.test(text)) warnings.push("입력하지 않은 무료 여부");
  if (project.benefits.filter(Boolean).length === 0 && /증정|선물|드립니다/u.test(text)) warnings.push("입력하지 않은 증정 혜택");
  return [...new Set(warnings)];
}
