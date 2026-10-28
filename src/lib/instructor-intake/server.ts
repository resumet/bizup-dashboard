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
  DEFAULT_INTAKE_SETTINGS,
  EMPTY_ANSWERS,
  EMPTY_IMAGE_PATHS,
  imagePathsSchema,
  intakeSettingsSchema,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  MAX_MATERIAL_IMAGES,
  materialImageCategorySchema,
  PHOTO_BUCKET,
  tokenSchema,
  type Answers,
  type ImagePaths,
  type IntakeSettings,
  type MaterialImageCategory,
  type Photo,
} from "./model";

export type IntakeRow = {
  id: string;
  workspace_id: string;
  course_id: string | null;
  title: string;
  access_token: string;
  share_enabled: boolean;
  answers: Answers;
  photo_paths: string[];
  image_paths: ImagePaths;
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
    image_paths: imagePathsSchema.parse({
      ...EMPTY_IMAGE_PATHS,
      ...(row.image_paths ?? {}),
    }),
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
export async function signedPhotos(
  paths: string[],
  includeDownloads = false,
): Promise<Photo[]> {
  if (!paths.length) return [];
  const client = createAdminClient();
  const { data, error } = await client
    .storage.from(PHOTO_BUCKET)
    .createSignedUrls(paths, 3600);
  if (error || data?.some((item) => item.error || !item.signedUrl))
    throw error ?? new Error("사진을 불러오지 못했습니다.");
  const photos = (data ?? []).map((item) => ({
    path: item.path!,
    url: item.signedUrl!,
  }));
  if (!includeDownloads) return photos;
  return Promise.all(
    photos.map(async (photo, index) => {
      const { data: download, error: downloadError } = await client.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(photo.path, 3600, {
          download: `강사자료-${index + 1}.webp`,
        });
      if (downloadError || !download?.signedUrl)
        throw downloadError ?? new Error("다운로드 링크를 만들지 못했습니다.");
      return { ...photo, downloadUrl: download.signedUrl };
    }),
  );
}

export async function signedImageGroups(
  paths: ImagePaths,
  includeDownloads = false,
) {
  return {
    evidence: await signedPhotos(paths.evidence, includeDownloads),
    studentResults: await signedPhotos(paths.studentResults, includeDownloads),
    reviews: await signedPhotos(paths.reviews, includeDownloads),
    opportunity: await signedPhotos(paths.opportunity, includeDownloads),
  };
}

export async function intakeSettings(workspaceId: string): Promise<IntakeSettings> {
  const { data, error } = await createAdminClient()
    .from("instructor_intake_settings")
    .select("examples,example_image_paths")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error && !/PGRST205|42P01/.test(error.code)) throw error;
  if (!data) return DEFAULT_INTAKE_SETTINGS;
  return intakeSettingsSchema.parse({
    examples: { ...DEFAULT_INTAKE_SETTINGS.examples, ...data.examples },
    exampleImagePaths: {
      ...EMPTY_IMAGE_PATHS,
      ...data.example_image_paths,
    },
  });
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
async function optimizedImage(file: File) {
  if (
    file.size === 0 ||
    file.size > MAX_PHOTO_BYTES ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("사진은 3MB 이하의 JPG, PNG, WebP 파일을 선택해 주세요.");
  try {
    return await sharp(Buffer.from(await file.arrayBuffer()), {
      failOn: "error",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new Error("이미지 파일을 읽을 수 없습니다. 다른 사진을 선택해 주세요.");
  }
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
  const bytes = await optimizedImage(file);
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
    if (!data || !data.photo_paths.includes(path)) await removePhotos([path]);
    throw error;
  }
}

export async function uploadMaterialImage(
  row: IntakeRow,
  file: File,
  revision: number,
  rawCategory: string,
) {
  const category = materialImageCategorySchema.parse(rawCategory);
  if (row.image_paths[category].length >= MAX_MATERIAL_IMAGES)
    throw new Error(`${MAX_MATERIAL_IMAGES}장까지 저장할 수 있습니다.`);
  const bytes = await optimizedImage(file);
  const path = `${row.workspace_id}/${row.id}/materials/${category}/${crypto.randomUUID()}.webp`;
  const client = createAdminClient();
  const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, bytes, {
    contentType: "image/webp",
    upsert: false,
  });
  if (error) throw error;
  try {
    const next = { ...row.image_paths, [category]: [...row.image_paths[category], path] };
    const updated = await updatePublicIntake(row, revision, { image_paths: next, submitted_at: null });
    return { photo: (await signedPhotos([path]))[0], revision: updated.revision, category };
  } catch (error) {
    const { data } = await client.from("instructor_intakes").select("image_paths").eq("id", row.id).maybeSingle();
    const stored = data ? imagePathsSchema.parse(data.image_paths) : EMPTY_IMAGE_PATHS;
    if (!Object.values(stored).flat().includes(path)) await removePhotos([path]);
    throw error;
  }
}

export async function uploadSettingsExampleImage(
  workspaceId: string,
  userId: string,
  file: File,
  rawCategory: string,
) {
  const category: MaterialImageCategory = materialImageCategorySchema.parse(rawCategory);
  const settings = await intakeSettings(workspaceId);
  if (settings.exampleImagePaths[category].length >= MAX_MATERIAL_IMAGES)
    throw new Error(`${MAX_MATERIAL_IMAGES}장까지 저장할 수 있습니다.`);
  const bytes = await optimizedImage(file);
  const path = `${workspaceId}/settings/examples/${category}/${crypto.randomUUID()}.webp`;
  const client = createAdminClient();
  const { error: uploadError } = await client.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: "image/webp", upsert: false });
  if (uploadError) throw uploadError;
  const nextPaths = { ...settings.exampleImagePaths, [category]: [...settings.exampleImagePaths[category], path] };
  const { error } = await client.from("instructor_intake_settings").upsert({
    workspace_id: workspaceId,
    examples: settings.examples,
    example_image_paths: nextPaths,
    updated_by: userId,
  });
  if (error) { await removePhotos([path]); throw error; }
  return { photo: (await signedPhotos([path]))[0], category };
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
