import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { parseShoongIntegrationGuide } from "@/lib/messages/shoong-guide";

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user)
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  let parsed;
  try {
    const body = await request.json();
    parsed = parseShoongIntegrationGuide(body.guide);
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "API 연동 가이드를 분석하지 못했습니다.",
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) {
    return Response.json(
      { message: "워크스페이스 권한이 없습니다." },
      { status: 403 },
    );
  }

  const { data: existing, error: existingError } = await admin
    .from("message_templates")
    .select("id,workspace_id,is_system")
    .eq("id", parsed.templateCode)
    .maybeSingle();
  if (existingError) {
    return Response.json({ message: existingError.message }, { status: 400 });
  }
  if (
    existing &&
    (existing.is_system || existing.workspace_id !== membership.workspace_id)
  ) {
    return Response.json(
      {
        message:
          "같은 templatecode를 사용하는 기본 템플릿 또는 다른 워크스페이스 템플릿이 이미 있습니다.",
      },
      { status: 409 },
    );
  }

  const templateValues = {
    id: parsed.templateCode,
    workspace_id: membership.workspace_id,
    name: parsed.name,
    template_code: parsed.templateCode,
    send_type: parsed.sendType,
    applicant_variable: parsed.applicantVariable,
    course_variable: parsed.courseVariable,
    variable_names: parsed.variableNames,
    created_by: user.id,
  };
  const query = existing
    ? admin
        .from("message_templates")
        .update(templateValues)
        .eq("id", parsed.templateCode)
    : admin.from("message_templates").insert(templateValues);
  const { data, error } = await query
    .select(
      "id,name,template_code,send_type,applicant_variable,course_variable,variable_names,is_system",
    )
    .single();

  return error
    ? Response.json({ message: error.message }, { status: 400 })
    : Response.json(data, { status: existing ? 200 : 201 });
}
