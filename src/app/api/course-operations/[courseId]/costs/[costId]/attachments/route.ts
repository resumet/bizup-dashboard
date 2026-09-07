import { authorizeCourseCosts, courseCostError, loadCourseCosts } from "@/lib/course-costs/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string; costId: string }> };
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function POST(request: Request, { params }: Context) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  try {
    const { courseId, costId } = await params;
    const { admin, workspaceId, locked } = await authorizeCourseCosts(courseId, user.id);
    if (locked) throw new Error("정산이 확정되어 증빙을 변경할 수 없습니다.");
    const { data: cost } = await admin.from("course_costs").select("id").eq("id", costId).eq("course_id", courseId).is("deleted_at", null).maybeSingle();
    if (!cost) throw new Error("비용을 찾을 수 없습니다.");
    const files = (await request.formData()).getAll("files").filter((item): item is File => item instanceof File);
    if (!files.length) throw new Error("첨부할 파일을 선택해 주세요.");
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const extension = file.name.toLowerCase().match(/\.[^.]+$/u)?.[0] ?? "";
        const mimeType = MIME_BY_EXTENSION[extension];
        if (!mimeType || (file.type && file.type !== mimeType)) throw new Error(`${file.name}: PDF, JPG, JPEG, PNG, XLS, XLSX만 첨부할 수 있습니다.`);
        if (file.size < 1 || file.size > MAX_FILE_SIZE) throw new Error(`${file.name}: 파일은 20MB 이하여야 합니다.`);
        const id = crypto.randomUUID();
        const path = `${workspaceId}/${courseId}/${costId}/${id}${extension}`;
        const { error: uploadError } = await admin.storage.from("course-cost-evidence").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: mimeType });
        if (uploadError) throw new Error(`증빙 저장 실패: ${uploadError.message}`);
        uploaded.push(path);
        const { error } = await admin.from("course_cost_attachments").insert({ id, course_cost_id: costId, storage_path: path, original_name: file.name, mime_type: mimeType, file_size: file.size, uploaded_by: user.id });
        if (error) throw new Error(`증빙 기록 실패: ${error.code}`);
      }
    } catch (error) {
      if (uploaded.length) {
        await admin.storage.from("course-cost-evidence").remove(uploaded);
        await admin.from("course_cost_attachments").delete().in("storage_path", uploaded);
      }
      throw error;
    }
    await admin.from("course_cost_audit_logs").insert({ course_cost_id: costId, course_id: courseId, actor_id: user.id, action: "ATTACHMENT_ADDED", after_data: { file_count: files.length } });
    return Response.json({ costs: await loadCourseCosts(admin, courseId), locked: false });
  } catch (error) { return courseCostError(error); }
}
