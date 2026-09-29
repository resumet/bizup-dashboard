import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emptyInstagramMaterials,
  type InstagramMaterial,
  type InstagramShare,
} from "./instagram-materials";
import {
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "./server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function authorizeCourseInstagram(courseId: string) {
  const supabase = await createClient();
  const user = await requireCourseOperationsUser(supabase);
  const membership = await requireCourseOperationsMembership(user.id);
  const admin = createAdminClient();
  const { data: course, error } = await admin
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();
  if (error) throw new Error(`강의 조회 실패: ${error.code}`);
  if (!course) throw new Error("NOT_FOUND");
  return { admin, userId: user.id };
}

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
  return {
    position: row.position,
    title: row.title,
    notionUrl: row.notion_url,
  };
}

export function toInstagramShare(row: {
  public_id: string;
  is_public: boolean;
}): InstagramShare {
  return { publicId: row.public_id, isPublic: row.is_public };
}
