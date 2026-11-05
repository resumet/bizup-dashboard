import { hasAdminAccess } from "@/lib/admin/access";
import { isInstructorContractTemplate } from "@/lib/contracts/instructor-contract";
import { saveInstructorContractTemplate } from "@/lib/contracts/instructor-contract-template-server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  const membership = await requireCourseOperationsMembership(user.id);
  if (!hasAdminAccess(user.email, membership.role)) {
    return Response.json({ message: "관리자만 계약서 템플릿을 수정할 수 있습니다." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "수정할 템플릿을 확인해 주세요." }, { status: 400 });
  }
  if (!isInstructorContractTemplate(body)) {
    return Response.json({ message: "계약서 제목과 조항 내용을 확인해 주세요." }, { status: 400 });
  }

  try {
    const template = await saveInstructorContractTemplate(membership.workspace_id, user.id, body);
    return Response.json({ template }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("instructor_contract_template_save_failed", error);
    return Response.json({ message: "계약서 템플릿을 저장하지 못했습니다. 다시 시도해 주세요." }, { status: 500 });
  }
}
