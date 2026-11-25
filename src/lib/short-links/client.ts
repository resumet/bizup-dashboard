import "server-only";
import { z } from "zod";
import { loadShortUrlApiKey } from "@/lib/admin/short-url-key";

export const shortLinkInputSchema = z.object({
  course_id: z.string().uuid(),
  type: z.string().regex(/^\d{4}$/),
  destination_url: z.string().trim().url().max(2000).refine(value => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }),
  name: z.string().trim().min(1).max(120),
});

export class ShortLinkError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

const messages: Record<string, string> = {
  INVALID_API_KEY: "짧은 주소 API 키가 올바르지 않습니다. 관리자 설정에서 확인해 주세요.",
  INSUFFICIENT_SCOPE: "API 키에 짧은 주소 생성 권한이 없습니다.",
  COURSE_REQUIRED: "짧은 주소 서비스에서 강의 UUID를 찾을 수 없습니다.",
  COURSE_NOT_ACTIVE: "종료된 강의는 짧은 주소를 발급할 수 없습니다.",
  VALIDATION_ERROR: "짧은 주소의 타입, 연결 주소 또는 이름을 확인해 주세요.",
  RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
};
const resultSchema = z.string().url().refine(value => {
  const url = new URL(value);
  return url.origin === "https://bizup.im" && !url.username && !url.password;
});

export async function createShortLink(input: z.input<typeof shortLinkInputSchema>, dependencies = {
  request: fetch,
  loadKey: loadShortUrlApiKey,
}) {
  const parsed = shortLinkInputSchema.safeParse(input);
  if (!parsed.success) throw new ShortLinkError("강의 UUID, 4자리 타입, 연결 주소와 이름을 확인해 주세요.", 400);
  let key: string | null;
  try { key = await dependencies.loadKey(); }
  catch { throw new ShortLinkError("API 키를 읽을 수 없습니다. 관리자 설정에서 다시 저장해 주세요.", 503); }
  if (!key) throw new ShortLinkError("관리자 설정에서 짧은 주소 발급 API 키를 먼저 등록해 주세요.", 503);
  let response: Response;
  try {
    response = await dependencies.request("https://bizup.im/api/v1/short-links", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new ShortLinkError("짧은 주소 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
  const body = await response.json().catch(() => null);
  const existing = response.status === 409 && body?.error?.code === "LINK_TYPE_EXISTS";
  if (response.status === 201 || existing) {
    const url = resultSchema.safeParse(existing ? body?.error?.details?.short_url : body?.short_url);
    if (!url.success) throw new ShortLinkError("짧은 주소 서비스의 응답이 올바르지 않습니다.");
    return { short_url: url.data, existing };
  }
  throw new ShortLinkError(messages[body?.error?.code] || "짧은 주소 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.", response.status === 429 ? 429 : 502);
}
