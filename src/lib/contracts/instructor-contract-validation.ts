import { z } from "zod";

import { courseDocumentContentSchema } from "@/lib/course-documents/validation";
import {
  legacyInstructorContractTemplateToContent,
  normalizeContractNumberInput,
  type InstructorContractTemplate,
  type InstructorContractValues,
  type LegacyInstructorContractTemplate,
} from "@/lib/contracts/instructor-contract";

const legacyTemplateSchema = z.object({
  introduction: z.string().max(200_000),
  sections: z.array(z.object({
    title: z.string().max(2_000),
    paragraphs: z.array(z.string().max(200_000)).max(500),
  })).min(1).max(100),
});

const currentTemplateSchema = z.object({
  version: z.literal(2),
  content: courseDocumentContentSchema,
}).superRefine((template, context) => {
  if (!template.content.length) {
    context.addIssue({ code: "custom", path: ["content"], message: "계약서 원문을 입력해 주세요." });
  }
});

export const instructorContractValuesSchema = z.object({
  instructorName: z.string().max(200),
  lectureName: z.string().max(200),
  instagramNumberOfReels: z.string().max(6).regex(/^[0-9]*$/u, "릴스 대행 갯수는 숫자로 입력해 주세요."),
  instagramValueOfReels: z.string().max(24).regex(/^[0-9]*$/u, "릴스 대행 금액은 숫자로 입력해 주세요."),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "계약 시작일을 확인해 주세요."),
  durationYears: z.number().int().min(1).max(20),
  address: z.string().max(500),
  phone: z.string().max(100),
  email: z.string().max(320),
}).transform((values) => ({
  ...values,
  instagramNumberOfReels: normalizeContractNumberInput(values.instagramNumberOfReels),
  instagramValueOfReels: normalizeContractNumberInput(values.instagramValueOfReels),
}));

export const createInstructorContractSchema = z.object({
  templateId: z.string().trim().min(1).max(100),
  values: instructorContractValuesSchema,
});

export const saveInstructorContractTemplateSchema = z.object({
  name: z.string().trim().min(1, "템플릿 이름을 입력해 주세요.").max(100),
  template: currentTemplateSchema,
});

export function parseInstructorContractTemplate(value: unknown): InstructorContractTemplate | null {
  const current = currentTemplateSchema.safeParse(value);
  if (current.success) return current.data as InstructorContractTemplate;

  const legacy = legacyTemplateSchema.safeParse(value);
  if (!legacy.success) return null;
  return {
    version: 2,
    content: legacyInstructorContractTemplateToContent(legacy.data as LegacyInstructorContractTemplate),
  };
}

export function parseInstructorContractValues(value: unknown): InstructorContractValues | null {
  const parsed = instructorContractValuesSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseRenderedInstructorContractContent(value: unknown) {
  const parsed = courseDocumentContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
