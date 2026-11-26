import { replayLinkRequest, shortLinkInputSchema, shortLinkResultSchema, type ShortLinkInput } from "./model";

// All screens call this gateway. Provider access and credentials stay on the server.
export async function issueCourseShortLink(input: ShortLinkInput | { course_id: string; purpose: "replay-guide" }, request: typeof fetch = fetch) {
  const parsed = shortLinkInputSchema.or(replayLinkRequest).safeParse(input);
  if (!parsed.success) throw new Error("강의 UUID, 유형 식별자, 연결 주소와 이름을 확인해 주세요.");
  const { course_id: courseId, ...body } = parsed.data;
  let response: Response;
  try {
    response = await request(`/api/course-operations/${courseId}/short-links`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(35000),
    });
  } catch { throw new Error("짧은 주소 요청에 응답이 없습니다. 잠시 후 다시 시도해 주세요."); }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result?.message === "string" ? result.message : "짧은 주소를 발급하지 못했습니다.");
  const validated = shortLinkResultSchema.safeParse(result);
  if (!validated.success) throw new Error("짧은 주소 응답이 올바르지 않습니다.");
  return validated.data;
}
