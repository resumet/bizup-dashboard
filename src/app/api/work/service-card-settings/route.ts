import { isSuperAdminEmail } from "@/lib/admin/access";
import { workServiceCardSettingsSchema } from "@/lib/work/service-card-settings";
import { loadWorkServiceCardSettings, saveWorkServiceCardSettings } from "@/lib/work/service-card-settings-storage";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const headers={"Cache-Control":"private, no-store"};

export async function GET() {
  const user=await getAuthenticatedUser(await createClient());
  if(!user) return Response.json({message:"로그인이 필요합니다."},{status:401,headers});
  try { return Response.json(await loadWorkServiceCardSettings(),{headers}); }
  catch { return Response.json({message:"카드 표시 설정을 불러오지 못했습니다."},{status:500,headers}); }
}

export async function PUT(request:Request) {
  const user=await getAuthenticatedUser(await createClient());
  if(!user) return Response.json({message:"로그인이 필요합니다."},{status:401,headers});
  if(!isSuperAdminEmail(user.email)) return Response.json({message:"최고관리자만 카드 표시 설정을 변경할 수 있습니다."},{status:403,headers});
  let body:unknown;
  try { body=await request.json(); }
  catch { return Response.json({message:"요청 본문이 올바르지 않습니다."},{status:400,headers}); }
  const parsed=workServiceCardSettingsSchema.safeParse(body);
  if(!parsed.success) return Response.json({message:"카드 표시 설정이 올바르지 않습니다."},{status:400,headers});
  try { return Response.json(await saveWorkServiceCardSettings(parsed.data),{headers}); }
  catch { return Response.json({message:"카드 표시 설정을 저장하지 못했습니다."},{status:500,headers}); }
}
