import { z } from "zod";

import { courseDocumentContentSchema } from "@/lib/course-documents/validation";
import {
  legacyInstructorContractTemplateToContent,
  type InstructorContractTemplate,
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
