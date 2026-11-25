export const COURSE_API_ORIGIN = "https://bizup.im";
export type PublicCourse = { id: string; name: string; instructorName: string; cohort: string; webinarDate: string | null };

function headers(allowed: boolean) {
  return {
    "Cache-Control": "private, no-store",
    "Vary": "Origin",
    ...(allowed ? { "Access-Control-Allow-Origin": COURSE_API_ORIGIN } : {}),
  };
}

export async function courseApiResponse(request: Request, load: () => Promise<PublicCourse[]>) {
  const allowed = request.headers.get("origin") === COURSE_API_ORIGIN;
  if (!allowed) return Response.json({ message: "허용되지 않은 출처입니다." }, { status: 403, headers: headers(false) });
  if (request.method === "OPTIONS") {
    const method = request.headers.get("access-control-request-method");
    const requestedHeaders = request.headers.get("access-control-request-headers")?.toLowerCase().split(",").map(value => value.trim()).filter(Boolean) ?? [];
    if ((method && method !== "GET") || requestedHeaders.some(value => !["content-type", "accept"].includes(value))) {
      return Response.json({ message: "허용되지 않은 요청입니다." }, { status: 403, headers: headers(true) });
    }
    return new Response(null, { status: 204, headers: { ...headers(true), "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept" } });
  }
  try { return Response.json({ courses: await load() }, { headers: headers(true) }); }
  catch { return Response.json({ message: "강의 목록을 불러오지 못했습니다." }, { status: 500, headers: headers(true) }); }
}
