import { z } from "zod";

export const INSTAGRAM_MATERIAL_COUNT = 40;

export type InstagramMaterial = {
  position: number;
  title: string;
  notionUrl: string;
};

export type InstagramShare = {
  publicId: string;
  isPublic: boolean;
};

export function normalizePublicNotionUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const markdownLink = trimmed.match(/^\[[^\]]+\]\((https:\/\/[^)]+)\)$/u);
  const candidate = markdownLink?.[1] ?? trimmed;
  try {
    return new URL(candidate).toString();
  } catch {
    return candidate;
  }
}

export function isPublicNotionUrl(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:"
      && !parsed.username
      && !parsed.password
      && (host === "notion.site" || host.endsWith(".notion.site"))
      && Boolean(extractPublicNotionPageId(value));
  } catch {
    return false;
  }
}

export function extractPublicNotionPageId(value: string) {
  try {
    const parsed = new URL(value);
    const compactPath = decodeURIComponent(parsed.pathname).replaceAll("-", "");
    return compactPath.match(/([0-9a-f]{32})(?:[^0-9a-f]|$)/iu)?.[1]?.toLowerCase() ?? "";
  } catch {
    return "";
  }
}

export function toPublicNotionEmbedUrl(value: string) {
  if (!isPublicNotionUrl(value)) return "";
  const parsed = new URL(value);
  const pageId = extractPublicNotionPageId(value);
  return `${parsed.origin}/ebd/${pageId}`;
}

export const instagramMaterialPositionSchema = z.number().int().min(1).max(INSTAGRAM_MATERIAL_COUNT);
export const instagramMaterialTitleSchema = z.string().trim().max(200, "제목은 200자 이하로 입력해 주세요.");
export const instagramMaterialNotionUrlSchema = z.string()
  .trim()
  .max(4096)
  .transform(normalizePublicNotionUrl)
  .refine(
    (value) => !value || isPublicNotionUrl(value),
    "웹에 게시된 notion.site 주소를 입력해 주세요.",
  )
  .refine((value) => value.length <= 2048, "Notion 주소는 2,048자 이하로 입력해 주세요.");

export function emptyInstagramMaterials(): InstagramMaterial[] {
  return Array.from({ length: INSTAGRAM_MATERIAL_COUNT }, (_, index) => ({
    position: index + 1,
    title: "",
    notionUrl: "",
  }));
}
