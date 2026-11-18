import "server-only";

const origin = "https://admin.systemnova.co.kr";
const allowedOrigins = new Set([origin, "https://www.bizupclass.com", "https://bizupclass.com", "https://m.site.naver.com"]);

export async function resolveFreeCourseId(link: string, request: typeof fetch = fetch): Promise<string> {
  let url: URL;
  try { url = new URL(link); } catch { throw new Error("강의 상세에서 무료 랜딩페이지 링크를 저장해 주세요."); }
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!allowedOrigins.has(url.origin) || url.username || url.password) throw new Error("비즈업 무료 랜딩페이지 또는 네이버 단축 링크를 사용해 주세요.");
    const id = /^\/free-courses\/([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})(?:\/apply)?\/?$/i.exec(url.pathname)?.[1];
    if (id && url.hostname !== "m.site.naver.com") return id;
    if (url.hostname !== "m.site.naver.com") break;
    const response = await request(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15000) });
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (response.status < 300 || response.status > 399 || !location) break;
    url = new URL(location, url);
  }
  throw new Error("무료 랜딩페이지에서 강의 ID를 확인하지 못했습니다. 강의 링크를 확인해 주세요.");
}

export async function fetchAdminCoursePage(link: string, page: "apply" | "tracking", request: typeof fetch = fetch) {
  const courseId = await resolveFreeCourseId(link, request);
  const id = process.env.SYSTEMNOVA_ADMIN_ID?.trim();
  const password = process.env.SYSTEMNOVA_ADMIN_PASSWORD;
  if (!id || !password) throw new Error("비즈업 관리자 로그인 정보가 설정되지 않았습니다.");
  const login = await request(`${origin}/api/login`, {
    method: "POST", headers: { "content-type": "application/json", "accept": "application/json" },
    body: JSON.stringify({ id, password }), redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  const cookie = login.headers.getSetCookie().find(value => value.startsWith("AdminSession="))?.split(";")[0];
  await login.body?.cancel();
  if (!login.ok || !cookie) throw new Error("비즈업 관리자 로그인에 실패했습니다. 로그인 설정을 확인해 주세요.");
  const response = await request(`${origin}/free-courses/${courseId}/${page}`, {
    headers: page === "tracking"
      ? { cookie, accept: "text/html" }
      : { cookie, rsc: "1", accept: "text/x-component" },
    redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error("비즈업 관리자 페이지에 접속하지 못했습니다. 강의 링크와 계정 권한을 확인해 주세요."); }
  const text = await response.text();
  if (text.includes("NEXT_REDIRECT")) throw new Error("비즈업 관리자 인증이 만료되었습니다. 다시 가져와 주세요.");
  return { courseId, text };
}
