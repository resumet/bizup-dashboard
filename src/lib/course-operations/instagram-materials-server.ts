import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emptyInstagramMaterials,
  type InstagramMaterial,
  type InstagramShare,
} from "./instagram-materials";

export async function ensureCourseInstagramMaterials(
  admin: SupabaseClient,
  courseId: string,
) {
  const { error: materialsError } = await admin
    .from("course_instagram_materials")
    .upsert(
      emptyInstagramMaterials().map((material) => ({
        course_id: courseId,
        position: material.position,
      })),
      { onConflict: "course_id,position", ignoreDuplicates: true },
    );
  if (materialsError) throw new Error(`인스타 자료 초기화 실패: ${materialsError.code}`);

  const { error: shareError } = await admin
    .from("course_instagram_shares")
    .upsert({ course_id: courseId }, { onConflict: "course_id", ignoreDuplicates: true });
  if (shareError) throw new Error(`인스타 공개 설정 초기화 실패: ${shareError.code}`);
}

export function toInstagramMaterial(row: {
  position: number;
  title: string;
  notion_url: string;
}): InstagramMaterial {
  return { position: row.position, title: row.title, notionUrl: row.notion_url };
}

export function toInstagramShare(row: {
  public_id: string;
  is_public: boolean;
}): InstagramShare {
  return { publicId: row.public_id, isPublic: row.is_public };
}
