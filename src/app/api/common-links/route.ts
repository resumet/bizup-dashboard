import { isSuperAdminEmail } from "@/lib/admin/access";
import { commonLinksSchema } from "@/lib/admin/common-links";
import { loadCommonLinks, saveCommonLinks } from "@/lib/admin/common-links-storage";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
  try { return Response.json({ links: await loadCommonLinks() }, { headers }); }
  catch { return Response.json({ message: "공통 링크를 불러오지 못했습니다." }, { status: 500, headers }); }
}

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
  if (!isSuperAdminEmail(user.email)) return Response.json({ message: "최고관리자만 공통 링크를 변경할 수 있습니다." }, { status: 403, headers });
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ message: "요청 본문이 올바르지 않습니다." }, { status: 400, headers }); }
  const parsed = commonLinksSchema.safeParse(body);
  if (!parsed.success) return Response.json({ message: parsed.error.issues[0].message }, { status: 400, headers });
  try { return Response.json({ links: await saveCommonLinks(parsed.data) }, { headers }); }
  catch { return Response.json({ message: "공통 링크를 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500, headers }); }
}
