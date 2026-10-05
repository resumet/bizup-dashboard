import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ZodError } from "zod";
import { redirect } from "next/navigation";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  requireCourseOperationsMembership,
  requireCourseOperationsUser,
} from "@/lib/course-operations/server";
import {
  answersSchema,
  EMPTY_ANSWERS,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  PHOTO_BUCKET,
  tokenSchema,
  type Answers,
  type Photo,
} from "./model";

export type IntakeRow = {
  id: string;
  workspace_id: string;
  title: string;
  access_token: string;
  share_enabled: boolean;
  answers: Answers;
  photo_paths: string[];
  revision: number;
  submitted_at: string | null;
  updated_at: string;
};
export function newShareToken() {
  return randomBytes(24).toString("hex");
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export async function intakeMember() {
  const user = await requireCourseOperationsUser(await createClient());
  const membership = await requireCourseOperationsMembership(user.id);
  return { user, workspaceId: membership.workspace_id as string };
}
export async function intakePageMember() {
  try {
    return await intakeMember();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED")
      redirect("/login");
    throw error;
  }
}
export function normalizeIntake(row: IntakeRow): IntakeRow {
  return {
    ...row,
    answers: answersSchema.parse({ ...EMPTY_ANSWERS, ...row.answers }),
  };
}
export async function memberIntake(workspaceId: string, id: string) {
  const { data, error } = await createAdminClient()
    .from("instructor_intakes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
  return normalizeIntake(data as IntakeRow);
}
export async function publicIntake(token: string) {
  if (!tokenSchema.safeParse(token).success) throw new Error("NOT_FOUND");
  const { data, error } = await createAdminClient()
    .from("instructor_intakes")
    .select("*")
    .eq("access_token_hash", tokenHash(token))
    .eq("share_enabled", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("NOT_FOUND");
  return normalizeIntake(data as IntakeRow);
}
export async function signedPhotos(paths: string[]): Promise<Photo[]> {
  if (!paths.length) return [];
  const { data, error } = await createAdminClient()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrls(paths, 3600);
  if (error || data?.some((item) => item.error || !item.signedUrl))
    throw error ?? new Error("사진을 불러오지 못했습니다.");
  return (data ?? []).map((item) => ({
    path: item.path!,
    url: item.signedUrl!,
  }));
}
export async function updatePublicIntake(
  row: IntakeRow,
  revision: number,
  patch: Record<string, unknown>,
) {
  const { data, error } = await createAdminClient()
    .from("instructor_intakes")
    .update(patch)
    .eq("id", row.id)
    .eq("access_token_hash", tokenHash(row.access_token))
    .eq("share_enabled", true)
    .eq("revision", revision)
    .select("revision,submitted_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CONFLICT");
  return data as { revision: number; submitted_at: string | null };
}
export async function removePhotos(paths: string[]) {
  if (!paths.length) return;
  const { error } = await createAdminClient()
    .storage.from(PHOTO_BUCKET)
    .remove(paths);
  if (error) console.error("강사 사진 정리 실패", error.message);
}
export async function uploadPhoto(
  row: IntakeRow,
  file: File,
  revision: number,
) {
  if (row.photo_paths.length >= MAX_PHOTOS)
    throw new Error(
      `사진은 최대 ${MAX_PHOTOS}장까지 저장할 수 있습니다. 사진을 삭제했다면 중간 저장 후 추가해 주세요.`,
    );
  if (
    file.size === 0 ||
    file.size > MAX_PHOTO_BYTES ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("사진은 3MB 이하의 JPG, PNG, WebP 파일을 선택해 주세요.");
  let bytes: Buffer;
  try {
    bytes = await sharp(Buffer.from(await file.arrayBuffer()), {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: 1800,
        height: 1800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new Error(
      "이미지 파일을 읽을 수 없습니다. 다른 사진을 선택해 주세요.",
    );
  }
  const path = `${row.workspace_id}/${row.id}/${crypto.randomUUID()}.webp`;
  const { error } = await createAdminClient()
    .storage.from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType: "image/webp", upsert: false });
  if (error) throw error;
  try {
    const updated = await updatePublicIntake(row, revision, {
      photo_paths: [...row.photo_paths, path],
      submitted_at: null,
    });
    return {
      photo: (await signedPhotos([path]))[0],
      revision: updated.revision,
    };
  } catch (error) {
    // Only remove the file when it wasn't committed to the intake.
    const { data } = await createAdminClient()
      .from("instructor_intakes")
      .select("photo_paths")
      .eq("id", row.id)
      .maybeSingle();
    if (data && !data.photo_paths.includes(path)) await removePhotos([path]);
    throw error;
  }
}
export function intakeApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHORIZED")
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (message === "NOT_FOUND")
    return Response.json(
      { message: "링크가 만료되었거나 대상을 찾을 수 없습니다." },
      { status: 404 },
    );
  if (message === "CONFLICT")
    return Response.json(
      {
        message:
          "다른 화면에서 정보가 변경되었습니다. 입력 내용을 복사한 뒤 새로고침해 주세요.",
      },
      { status: 409 },
    );
  if (error instanceof ZodError)
    return Response.json(
      { message: error.issues[0]?.message ?? "입력값을 확인해 주세요." },
      { status: 400 },
    );
  if (message) return Response.json({ message }, { status: 400 });
  console.error("강사 정보 처리 실패", error);
  return Response.json(
    { message: "강사 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." },
    { status: 500 },
  );
}
