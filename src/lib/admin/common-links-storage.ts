import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { commonLinksSchema, DEFAULT_COMMON_LINKS, type CommonLink } from "./common-links";

const BUCKET = "admin-settings";
const PATH = "common-links.json";
function isMissing(error: { message: string; statusCode?: string | number }) {
  return String(error.statusCode) === "404" || /^(bucket|object) not found$/i.test(error.message);
}

export async function loadCommonLinks(admin = createAdminClient()): Promise<CommonLink[]> {
  const { data, error } = await admin.storage.from(BUCKET).download(PATH);
  if (error) {
    if (isMissing(error)) return DEFAULT_COMMON_LINKS;
    throw new Error("공통 링크를 불러오지 못했습니다. 다시 시도해 주세요.");
  }
  return commonLinksSchema.parse(JSON.parse(await data.text()));
}

export async function saveCommonLinks(links: CommonLink[], admin = createAdminClient()) {
  const validated = commonLinksSchema.parse(links);
  const { data: bucket, error: bucketError } = await admin.storage.getBucket(BUCKET);
  if (bucketError && !isMissing(bucketError)) throw new Error("공통 링크 저장소를 확인하지 못했습니다.");
  if (!bucket) {
    const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 262144, allowedMimeTypes: ["application/json"] });
    if (error && String(error.statusCode) !== "409" && !/already exists/i.test(error.message)) throw new Error("공통 링크 저장소를 준비하지 못했습니다.");
  }
  const { error } = await admin.storage.from(BUCKET).upload(PATH, JSON.stringify(validated), {
    contentType: "application/json", upsert: true, cacheControl: "0",
  });
  if (error) throw new Error("공통 링크를 저장하지 못했습니다. 다시 시도해 주세요.");
  return validated;
}
