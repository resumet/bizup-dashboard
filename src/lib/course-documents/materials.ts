import { z } from "zod";

import type { CourseDocumentMaterial } from "./types";

export const COURSE_DOCUMENT_MATERIAL_LIMIT = 40;

export const courseDocumentMaterialPositionSchema = z
  .number()
  .int()
  .min(1)
  .max(COURSE_DOCUMENT_MATERIAL_LIMIT);

export const courseDocumentMaterialTitleSchema = z
  .string()
  .trim()
  .max(200, "자료 제목은 200자까지 입력할 수 있습니다.");

export function courseDocumentMaterials(
  saved: Array<{ position: number; title: string; documentId: string | null }>,
): CourseDocumentMaterial[] {
  const savedByPosition = new Map(saved.map((material) => [material.position, material]));

  return Array.from({ length: COURSE_DOCUMENT_MATERIAL_LIMIT }, (_, index) => {
    const position = index + 1;
    const material = savedByPosition.get(position);
    return {
      position,
      title: material?.title ?? "",
      documentId: material?.documentId ?? null,
    };
  });
}
