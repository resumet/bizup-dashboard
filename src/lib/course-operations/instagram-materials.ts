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

function isSafeHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol)
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

const httpUrl = z.string().url().refine(isSafeHttpUrl, "http:// 또는 https:// 주소를 입력해 주세요.");

export const instagramMaterialPositionSchema = z.number().int().min(1).max(INSTAGRAM_MATERIAL_COUNT);
export const instagramMaterialTitleSchema = z.string().trim().max(200, "제목은 200자 이하로 입력해 주세요.");
export const instagramMaterialNotionUrlSchema = z.string().trim().max(2048).refine(
  (value) => !value || httpUrl.safeParse(value).success,
  "http:// 또는 https:// 주소를 입력해 주세요.",
);

export function emptyInstagramMaterials(): InstagramMaterial[] {
  return Array.from({ length: INSTAGRAM_MATERIAL_COUNT }, (_, index) => ({
    position: index + 1,
    title: "",
    notionUrl: "",
  }));
}
