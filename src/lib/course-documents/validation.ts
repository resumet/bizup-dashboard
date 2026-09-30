import { z } from "zod";

import type { RichTextNode } from "./types";

const blockIdSchema = z.uuid("블록 식별자가 올바르지 않습니다.");
const textSchema = z.string().trim().max(20_000, "블록 내용은 20,000자까지 입력할 수 있습니다.");
const safeUrlSchema = z
  .string()
  .trim()
  .max(2_048, "URL은 2,048자까지 입력할 수 있습니다.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "http 또는 https URL을 입력해 주세요.");

const textBlockSchema = z.object({
  id: blockIdSchema,
  type: z.enum(["heading1", "heading2", "paragraph"]),
  content: textSchema,
});

const listBlockSchema = z.object({
  id: blockIdSchema,
  type: z.enum(["unordered_list", "ordered_list"]),
  items: z.array(z.string().trim().max(2_000)).max(100),
});

const imageBlockSchema = z.object({
  id: blockIdSchema,
  type: z.literal("image"),
  url: safeUrlSchema,
  alt: z.string().trim().max(300),
});

const linkBlockSchema = z.object({
  id: blockIdSchema,
  type: z.literal("link"),
  label: z.string().trim().min(1, "링크 문구를 입력해 주세요.").max(200),
  url: safeUrlSchema,
});

const ctaBlockSchema = z.object({
  id: blockIdSchema,
  type: z.literal("cta"),
  label: z.string().trim().min(1, "버튼 문구를 입력해 주세요.").max(100),
  url: safeUrlSchema,
});

const richTextAttributeSchema = z.union([
  z.string().max(20_000),
  z.number(),
  z.boolean(),
  z.array(z.number()).max(100),
  z.null(),
]);
const richTextMarkSchema = z.object({
  type: z.enum(["bold", "italic", "underline", "strike", "code", "link"]),
  attrs: z.record(z.string(), richTextAttributeSchema).optional(),
});
const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() => z.object({
  type: z.enum([
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "taskList",
    "taskItem",
    "blockquote",
    "codeBlock",
    "horizontalRule",
    "hardBreak",
    "text",
    "image",
    "table",
    "tableRow",
    "tableHeader",
    "tableCell",
    "buttonLink",
  ]),
  attrs: z.record(z.string(), richTextAttributeSchema).optional(),
  content: z.array(richTextNodeSchema).max(500).optional(),
  marks: z.array(richTextMarkSchema).max(20).optional(),
  text: z.string().max(200_000).optional(),
}).superRefine((node, context) => {
  if (node.type === "text" && typeof node.text !== "string") {
    context.addIssue({ code: "custom", path: ["text"], message: "텍스트 내용이 올바르지 않습니다." });
  }
  if (node.type === "heading" && node.attrs?.level !== 1 && node.attrs?.level !== 2 && node.attrs?.level !== 3) {
    context.addIssue({ code: "custom", path: ["attrs", "level"], message: "제목 단계가 올바르지 않습니다." });
  }
  const urls: unknown[] = [];
  if (node.type === "image") urls.push(node.attrs?.src);
  if (node.type === "buttonLink") urls.push(node.attrs?.url);
  for (const mark of node.marks ?? []) if (mark.type === "link") urls.push(mark.attrs?.href);
  for (const value of urls) {
    if (typeof value !== "string" || !safeUrlSchema.safeParse(value).success) {
      context.addIssue({ code: "custom", path: ["attrs"], message: "문서에 올바르지 않은 URL이 있습니다." });
    }
  }
}));

const richTextBlockSchema = z.object({
  id: blockIdSchema,
  type: z.literal("rich_text"),
  content: richTextNodeSchema,
});

export const courseDocumentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  listBlockSchema,
  imageBlockSchema,
  linkBlockSchema,
  ctaBlockSchema,
  richTextBlockSchema,
]);

export const courseDocumentContentSchema = z
  .array(courseDocumentBlockSchema)
  .max(500, "문서에는 문단을 최대 500개까지 추가할 수 있습니다.")
  .superRefine((blocks, context) => {
    const ids = new Set<string>();
    for (const [index, block] of blocks.entries()) {
      if (ids.has(block.id)) {
        context.addIssue({ code: "custom", path: [index, "id"], message: "중복된 블록 식별자가 있습니다." });
      }
      ids.add(block.id);
    }
  });

export const courseDocumentTitleSchema = z.string().trim().min(1, "문서 제목을 입력해 주세요.").max(200);

export const saveCourseDocumentSchema = z.object({
  title: courseDocumentTitleSchema,
  content: courseDocumentContentSchema,
});

export const adminCourseDocumentSchema = saveCourseDocumentSchema.extend({
  status: z.enum(["draft", "published"]),
  leadGateEnabled: z.boolean(),
  leadGateAfterBlockId: z.string().uuid().nullable(),
}).superRefine((value, context) => {
  if (!value.leadGateEnabled) return;
  const gateIndex = value.content.findIndex((block) => block.id === value.leadGateAfterBlockId);
  if (!value.leadGateAfterBlockId || gateIndex < 0 || gateIndex >= value.content.length - 1) {
    context.addIssue({ code: "custom", path: ["leadGateAfterBlockId"], message: "리드게이트 위치를 선택해 주세요." });
  }
});

export const leadSubmissionSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(80),
  phone: z.string().trim().min(9, "전화번호를 확인해 주세요.").max(30),
  utmSource: z.string().trim().max(300).optional().default(""),
  utmMedium: z.string().trim().max(300).optional().default(""),
  utmCampaign: z.string().trim().max(300).optional().default(""),
  utmContent: z.string().trim().max(300).optional().default(""),
  referrer: z.string().trim().max(2_048).optional().default(""),
});

export const blockedPhoneSchema = z.object({
  phone: z.string().trim().min(9, "전화번호를 확인해 주세요.").max(30),
  memo: z.string().trim().max(500).optional().default(""),
});

export function normalizePhone(value: string) {
  return value.replace(/\D/gu, "");
}

export function assertValidKoreanPhone(value: string) {
  const normalized = normalizePhone(value);
  if (!/^0\d{8,10}$/u.test(normalized)) throw new Error("전화번호를 확인해 주세요.");
  return normalized;
}

export function splitDocumentAtLeadGate<T extends { id: string }>(
  blocks: T[],
  enabled: boolean,
  afterBlockId: string | null,
) {
  if (!enabled || !afterBlockId) return { publicBlocks: blocks, lockedBlocks: [] as T[] };
  const gateIndex = blocks.findIndex((block) => block.id === afterBlockId);
  if (gateIndex < 0 || gateIndex >= blocks.length - 1) {
    return { publicBlocks: blocks, lockedBlocks: [] as T[] };
  }
  return {
    publicBlocks: blocks.slice(0, gateIndex + 1),
    lockedBlocks: blocks.slice(gateIndex + 1),
  };
}

export function slugBase(title: string) {
  const normalized = title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 72);
  return normalized || "document";
}
