import {
  authorizeSettlement,
  loadSettlementState,
  settlementError,
} from "@/lib/course-settlements/server";
import { sanitizeSettlementStatementDraft } from "@/lib/course-settlements/statement";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ settlementId: string }> };

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function fileType(file: File) {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/u)?.[0] ?? "";
  const expected = MIME_BY_EXTENSION[extension];
  return expected && (!file.type || file.type === expected) ? expected : null;
}

export async function POST(request: Request, { params }: Context) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  }

  try {
    const { settlementId } = await params;
    const { admin, workspaceId, settlement } = await authorizeSettlement(
      settlementId,
      user.id,
    );
    const form = await request.formData();
    const costId = String(form.get("costId") ?? "").trim().slice(0, 200);
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    if (!costId) throw new Error("첨부할 비용 항목을 찾을 수 없습니다.");
    if (!files.length) throw new Error("첨부할 증빙 파일을 선택해 주세요.");

    const { data: course } = await admin
      .from("courses")
      .select("name")
      .eq("id", settlement.course_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!course) throw new Error("연결된 강의를 찾을 수 없습니다.");
    const draft = sanitizeSettlementStatementDraft(
      settlement.statement_draft,
      course.name,
    );
    if (!draft.costs.some((cost) => cost.id === costId)) {
      throw new Error("비용 내역을 먼저 저장한 뒤 증빙을 첨부해 주세요.");
    }

    const uploadedPaths: string[] = [];
    try {
      for (const file of files) {
        const extension = file.name.toLowerCase().match(/\.[^.]+$/u)?.[0] ?? "";
        const mimeType = fileType(file);
        if (!mimeType) {
          throw new Error(`${file.name}: PDF/JPG/JPEG/PNG 파일만 첨부할 수 있습니다.`);
        }
        if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
          throw new Error(`${file.name}: 파일 크기는 20 MiB 이하여야 합니다.`);
        }
        const attachmentId = crypto.randomUUID();
        const storagePath = `${workspaceId}/${settlement.course_id}/${settlement.id}/evidence/${attachmentId}${extension}`;
        const { error: uploadError } = await admin.storage
          .from("settlement-evidence")
          .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
            contentType: mimeType,
            upsert: false,
          });
        if (uploadError) throw new Error(`증빙 파일 저장 실패: ${uploadError.message}`);
        uploadedPaths.push(storagePath);
        const { error: recordError } = await admin
          .from("course_settlement_draft_attachments")
          .insert({
            id: attachmentId,
            settlement_id: settlement.id,
            cost_id: costId,
            storage_path: storagePath,
            original_filename: file.name,
            mime_type: mimeType,
            file_size: file.size,
            uploaded_by: user.id,
          });
        if (recordError) throw new Error(`증빙 기록 저장 실패: ${recordError.code}`);
      }
    } catch (error) {
      if (uploadedPaths.length) {
        await admin.storage.from("settlement-evidence").remove(uploadedPaths);
        await admin
          .from("course_settlement_draft_attachments")
          .delete()
          .in("storage_path", uploadedPaths);
      }
      throw error;
    }

    await admin.from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: user.id,
      event_type: "course_settlement.evidence_uploaded",
      entity_type: "course_settlement",
      entity_id: settlement.id,
      metadata: { cost_id: costId, file_count: files.length },
    });
    return Response.json({
      state: await loadSettlementState(admin, settlement),
    });
  } catch (error) {
    return settlementError(error);
  }
}
