import "server-only";
import { loadShortUrlApiKey } from "@/lib/admin/short-url-key";
import { shortLinkInputSchema, shortLinkTypesSchema, shortLinkResultSchema, type ShortLinkInput } from "./model";

export class ShortLinkError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

const messages: Record<string, string> = {
  INVALID_API_KEY: "짧은 주소 API 키가 올바르지 않습니다. 관리자 설정에서 확인해 주세요.",
  INSUFFICIENT_SCOPE: "API 키에 짧은 주소 생성 권한이 없습니다.",
  COURSE_REQUIRED: "짧은 주소 서비스에서 강의 UUID를 찾을 수 없습니다.",
  COURSE_NOT_ACTIVE: "종료된 강의는 짧은 주소를 발급할 수 없습니다.",
  VALIDATION_ERROR: "짧은 주소의 유형, 연결 주소 또는 이름을 확인해 주세요.",
  RATE_LIMITED: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
  UNKNOWN_LINK_TYPE: "등록되지 않은 짧은 주소 유형입니다. BZUP Link 운영자에게 확인해 주세요.",
  LINK_TYPE_INACTIVE: "비활성화된 짧은 주소 유형은 새로 발급할 수 없습니다.",
  IDEMPOTENCY_KEY_REUSED: "다른 요청에 사용된 재시도 키입니다. 새 요청으로 다시 시도해 주세요.",
};
type Dependencies = { request: typeof fetch; loadKey: () => Promise<string | null> };
const defaultDependencies: Dependencies = { request: (...args) => fetch(...args), loadKey: loadShortUrlApiKey };

async function readKey(dependencies: Dependencies) {
  let key: string | null;
  try { key = await dependencies.loadKey(); }
  catch { throw new ShortLinkError("API 키를 읽을 수 없습니다. 관리자 설정에서 다시 저장해 주세요.", 503); }
  if (!key) throw new ShortLinkError("관리자 설정에서 짧은 주소 발급 API 키를 먼저 등록해 주세요.", 503);
  return key;
}

async function providerRequest(path: string, key: string, dependencies: Dependencies, body?: ShortLinkInput) {
  try {
    return await dependencies.request(`https://bizup.im/api/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
  } catch { throw new ShortLinkError("짧은 주소 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
}

function providerError(status: number, code: unknown) {
  const message = typeof code === "string" && Object.hasOwn(messages, code) ? messages[code] : "짧은 주소 서비스 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  return new ShortLinkError(message, status === 429 ? 429 : 502);
}

async function readTypes(key: string, dependencies: Dependencies) {
  const response = await providerRequest("short-link-types", key, dependencies);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw providerError(response.status, body?.error?.code);
  const parsed = shortLinkTypesSchema.safeParse(body);
  if (!parsed.success) throw new ShortLinkError("짧은 주소 유형 목록 응답이 올바르지 않습니다.");
  return parsed.data.types;
}

export async function listShortLinkTypes(dependencies = defaultDependencies) {
  return readTypes(await readKey(dependencies), dependencies);
}

export async function createShortLink(input: ShortLinkInput, dependencies = defaultDependencies) {
  const parsed = shortLinkInputSchema.safeParse(input);
  if (!parsed.success) throw new ShortLinkError("강의 UUID, 유형 식별자, 연결 주소와 이름을 확인해 주세요.", 400);
  const key = await readKey(dependencies);
  const types = await readTypes(key, dependencies);
  if (!types.some(item => item.key === parsed.data.type_key)) throw new ShortLinkError(messages.UNKNOWN_LINK_TYPE, 422);
  // Inactive types may have an existing link: the provider decides between 409 and 422.
  const response = await providerRequest("short-links", key, dependencies, parsed.data);
  const body = await response.json().catch(() => null);
  const existing = response.status === 409 && body?.error?.code === "LINK_TYPE_EXISTS";
  if (response.status === 201 || existing) {
    const result = shortLinkResultSchema.safeParse({ short_url: existing ? body?.error?.details?.short_url : body?.short_url, existing });
    if (!result.success) throw new ShortLinkError("짧은 주소 서비스의 응답이 올바르지 않습니다.");
    return result.data;
  }
  throw providerError(response.status, body?.error?.code);
}
