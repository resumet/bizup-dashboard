import { isSuperAdminEmail } from "@/lib/admin/access";
import { saveShortUrlApiKey, shortUrlKeySchema, shortUrlKeyStatus } from "@/lib/admin/short-url-key";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };
async function authorize() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers });
  if (isSuperAdminEmail(user.email)) return null;
  const { data, error } = await createAdminClient().from("workspace_members").select("role").eq("user_id", user.id).eq("role", "super_admin").limit(1).maybeSingle();
  if (error || !data) return Response.json({ message: "최고관리자만 API 키를 관리할 수 있습니다." }, { status: 403, headers });
  return null;
}

export async function GET() {
  const denied = await authorize();
  if (denied) return denied;
  try { return Response.json(await shortUrlKeyStatus(), { headers }); }
  catch { return Response.json({ message: "API 키 설정을 불러오지 못했습니다." }, { status: 500, headers }); }
}

export async function PUT(request: Request) {
  const denied = await authorize();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const parsed = shortUrlKeySchema.safeParse(body);
  if (!parsed.success) return Response.json({ message: "API 키를 공백 없이 1~4,096자로 입력해 주세요." }, { status: 400, headers });
  try { return Response.json(await saveShortUrlApiKey(parsed.data), { headers }); }
  catch { return Response.json({ message: "API 키를 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500, headers }); }
}
