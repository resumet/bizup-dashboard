import { z } from "zod";

import type { CourseDocumentMaterial } from "./types";

export const COURSE_DOCUMENT_MATERIAL_LIMIT = 500;

export const courseDocumentMaterialPositionSchema = z
  .number()
  .int()
  .min(1)
  .max(COURSE_DOCUMENT_MATERIAL_LIMIT);

export const courseDocumentMaterialTitleSchema = z
  .string()
  .trim()
  .max(200, "자료 제목은 200자까지 입력할 수 있습니다.");

export const courseDocumentReferencePlanningNumberSchema = z
  .string()
  .trim()
  .regex(/^$|^[0-9]{1,2}$/, "참고기획번호는 두 자리 숫자로 입력해 주세요.")
  .transform((value) => value ? value.padStart(2, "0") : "");

export const courseDocumentPlanningSheetUrlSchema = z
  .string()
  .trim()
  .max(2048, "기획시트 URL은 2,048자까지 입력할 수 있습니다.")
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "올바른 기획시트 URL을 입력해 주세요.");

export const courseDocumentInstagramUrlSchema = z
  .string()
  .trim()
  .max(2048, "인스타그램 링크는 2,048자까지 입력할 수 있습니다.")
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  }, "올바른 HTTP 또는 HTTPS 링크를 입력해 주세요.");

export const courseDocumentMaterialDateSchema = z
  .string()
  .regex(/^$|^\d{4}-\d{2}-\d{2}$/, "날짜 형식을 확인해 주세요.");

export const courseDocumentDmMaterialSchema = z
  .string()
  .trim()
  .max(5000, "DM 자료는 5,000자까지 입력할 수 있습니다.");

export function courseDocumentMaterials(
  saved: Array<{
    position: number;
    title: string;
    referencePlanningNumber?: string;
    documentId: string | null;
    planningCompleted?: boolean;
    filmingDate?: string | null;
    filmingCompleted?: boolean;
    uploadDate?: string | null;
    uploadCompleted?: boolean;
    uploadedUrl?: string;
    dmMaterial?: string;
  }>,
  totalCount: number,
): CourseDocumentMaterial[] {
  const savedByPosition = new Map(saved.map((material) => [material.position, material]));

  const normalizedTotalCount = Math.max(0, Math.min(COURSE_DOCUMENT_MATERIAL_LIMIT, Math.trunc(totalCount)));

  return Array.from({ length: normalizedTotalCount }, (_, index) => {
    const position = index + 1;
    const material = savedByPosition.get(position);
    return {
      position,
      title: material?.title ?? "",
      referencePlanningNumber: material?.referencePlanningNumber ?? "",
      documentId: material?.documentId ?? null,
      planningCompleted: material?.planningCompleted ?? false,
      filmingDate: material?.filmingDate ?? "",
      filmingCompleted: material?.filmingCompleted ?? false,
      uploadDate: material?.uploadDate ?? "",
      uploadCompleted: material?.uploadCompleted ?? false,
      uploadedUrl: material?.uploadedUrl ?? "",
      dmMaterial: material?.dmMaterial ?? "",
    };
  });
}
