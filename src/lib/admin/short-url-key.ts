import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "admin-settings";
const PATH = "short-url-api-key.json";
const PURPOSE = "short-url-api-key:v1";
export const shortUrlKeySchema = z.object({ apiKey: z.string().trim().min(1, "API 키를 입력해 주세요.").max(4096, "API 키는 4,096자 이하여야 합니다.").regex(/^\S+$/, "API 키에 공백을 포함할 수 없습니다.") });

function encryptionKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("서버 암호화 키가 설정되지 않았습니다.");
  return createHash("sha256").update(`${PURPOSE}:${secret}`).digest();
}

export function encryptShortUrlKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(PURPOSE));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString("base64url")).join(".");
}

export function decryptShortUrlKey(value: string) {
  const [iv, tag, encrypted] = value.split(".").map(part => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(Buffer.from(PURPOSE));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

const recordSchema = z.object({ encryptedKey: z.string().min(1), updatedAt: z.string().datetime() });
function missing(error: { statusCode?: string | number; message: string }) {
  return String(error.statusCode) === "404" || /^(bucket|object) not found$/i.test(error.message);
}

async function readRecord(admin = createAdminClient()) {
  const { data, error } = await admin.storage.from(BUCKET).download(PATH);
  if (error) {
    if (missing(error)) return null;
    throw new Error("API 키 설정을 불러오지 못했습니다.");
  }
  return recordSchema.parse(JSON.parse(await data.text()));
}

export async function shortUrlKeyStatus(admin = createAdminClient()) {
  const record = await readRecord(admin);
  return { configured: Boolean(record), updatedAt: record?.updatedAt ?? null };
}

// Server-side issuing integrations only. Never return this value in a response.
export async function loadShortUrlApiKey(admin = createAdminClient()) {
  const record = await readRecord(admin);
  return record ? decryptShortUrlKey(record.encryptedKey) : null;
}

export async function saveShortUrlApiKey(input: unknown, admin = createAdminClient()) {
  const { apiKey } = shortUrlKeySchema.parse(input);
  const record = { encryptedKey: encryptShortUrlKey(apiKey), updatedAt: new Date().toISOString() };
  const { data: bucket, error: bucketError } = await admin.storage.getBucket(BUCKET);
  if (bucketError && !missing(bucketError)) throw new Error("저장소를 확인하지 못했습니다.");
  if (bucket?.public) throw new Error("비공개 저장소가 필요합니다.");
  if (!bucket) {
    const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 262144, allowedMimeTypes: ["application/json"] });
    if (error && String(error.statusCode) !== "409") throw new Error("저장소를 준비하지 못했습니다.");
  }
  const { error } = await admin.storage.from(BUCKET).upload(PATH, JSON.stringify(record), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw new Error("API 키를 저장하지 못했습니다.");
  return { configured: true, updatedAt: record.updatedAt };
}
