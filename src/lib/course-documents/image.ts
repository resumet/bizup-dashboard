import "server-only";

import sharp from "sharp";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function prepareCourseDocumentImage(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("JPG, PNG, WEBP 이미지만 업로드할 수 있습니다.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("이미지는 10MB까지 업로드할 수 있습니다.");
  try {
    const buffer = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 2_400, height: 2_400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer();
    return { buffer, contentType: "image/webp", extension: "webp" } as const;
  } catch {
    throw new Error("이미지 파일이 손상되었거나 지원하지 않는 형식입니다.");
  }
}
