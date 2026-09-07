import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  COURSE_BANNER_BUCKET,
  validateCourseBannerFile,
} from "./banner";

type CourseBannerMutation = {
  file: File | null;
  remove: boolean;
};

export async function readCourseOperationsRequest(request: Request) {
  if (!request.headers.get("content-type")?.includes("multipart/form-data")) {
    return {
      body: await request.json(),
      banner: { file: null, remove: false } satisfies CourseBannerMutation,
    };
  }

  const form = await request.formData();
  const serialized = form.get("course");
  if (typeof serialized !== "string") {
    throw new Error("강의 정보가 올바르지 않습니다.");
  }

  let body: unknown;
  try {
    body = JSON.parse(serialized);
  } catch {
    throw new Error("강의 정보가 올바르지 않습니다.");
  }

  const entry = form.get("banner");
  const file = entry instanceof File && entry.size > 0 ? entry : null;
  if (file) validateCourseBannerFile(file);

  return {
    body,
    banner: {
      file,
      remove: form.get("removeBanner") === "true",
    } satisfies CourseBannerMutation,
  };
}

export async function uploadCourseBanner(
  admin: SupabaseClient,
  workspaceId: string,
  courseId: string,
  file: File,
) {
  const extension = validateCourseBannerFile(file);
  const path = `${workspaceId}/${courseId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await admin.storage
    .from(COURSE_BANNER_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw new Error(`배너 이미지 저장 실패: ${error.message}`);
  return path;
}

export async function removeCourseBanner(
  admin: SupabaseClient,
  path: string,
) {
  if (!path) return;
  const { error } = await admin.storage
    .from(COURSE_BANNER_BUCKET)
    .remove([path]);
  if (error) console.error(`배너 이미지 삭제 실패: ${error.message}`);
}
