import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { courseDocumentErrorResponse } from "@/lib/course-documents/server";
import { requirePdfDocument } from "@/lib/course-documents/pdf-server";
import { PDF_BUCKET, PDF_MAX_BYTES, pdfOptionsSchema, validatePdfFile } from "@/lib/course-documents/pdf";
import { start } from "workflow/api";
import { pdfConversionWorkflow } from "@/workflows/pdf-conversion";

export const runtime = "nodejs";
const currentColumns = "id,file_name,status,stage,progress,error_message,result,created_at";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const documentId = z.uuid().parse(url.searchParams.get("documentId"));
    const token = request.headers.get("x-course-access-token");
    const { admin } = await requirePdfDocument(documentId, token);
    const selected = z.uuid().safeParse(url.searchParams.get("selectedId"));
    let current = null;
    if (selected.success) {
      const { data, error } = await admin.from("course_document_pdf_imports").select(currentColumns)
        .eq("document_id", documentId).eq("id", selected.data).maybeSingle();
      if (error) throw new Error(`PDF 처리 상태 조회 실패: ${error.code}`);
      current = data;
    }
    const response = NextResponse.json({ imports: current ? [current] : [] }, { headers: { "Cache-Control": "private, no-store" } });
    if (token) response.cookies.set(`pdf_course_${documentId}`, token, { httpOnly: true, secure: url.protocol === "https:", sameSite: "strict", path: "/api/course-document-pdfs", maxAge: 3600 });
    return response;
  } catch (error) { return courseDocumentErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const input = z.object({
      documentId: z.uuid(), fileName: z.string().min(1).max(200),
      fileSize: z.number().int().positive().max(PDF_MAX_BYTES), mime: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/u), options: pdfOptionsSchema,
    }).parse(await request.json());
    validatePdfFile({ name: input.fileName, size: input.fileSize, type: input.mime }, Number(process.env.PDF_MAX_FILE_BYTES) || PDF_MAX_BYTES);
    const { admin, document } = await requirePdfDocument(input.documentId, request.headers.get("x-course-access-token"));
    const { count, error: countError } = await admin.from("course_document_pdf_imports").select("id", { count: "exact", head: true })
      .eq("course_id", document.course_id).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if (countError) throw new Error(`PDF 업로드 한도 조회 실패: ${countError.code}`);
    if ((count ?? 0) >= 20) return Response.json({ message: "강의당 한 시간에 PDF를 20개까지 업로드할 수 있습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
    const id = randomUUID();
    const sourcePath = `${document.workspace_id}/${document.course_id}/${id}/source.pdf`;
    const { error } = await admin.from("course_document_pdf_imports").insert({
      id, document_id: document.id, course_id: document.course_id, workspace_id: document.workspace_id,
      file_name: input.fileName, file_size: input.fileSize, sha256: input.sha256, source_path: sourcePath, options: input.options,
    });
    if (error) throw new Error(`PDF 업로드 준비 실패: ${error.code}`);
    const upload = await admin.storage.from(PDF_BUCKET).createSignedUploadUrl(sourcePath);
    if (upload.error) {
      await admin.from("course_document_pdf_imports").delete().eq("id", id);
      throw new Error("PDF 업로드 주소를 생성하지 못했습니다.");
    }
    return Response.json({ id, uploadUrl: upload.data.signedUrl }, { status: 201 });
  } catch (error) { return courseDocumentErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const input = z.object({ documentId: z.uuid(), id: z.uuid(), action: z.literal("queue") }).parse(await request.json());
    const { admin } = await requirePdfDocument(input.documentId, request.headers.get("x-course-access-token"));
    const { data: job, error } = await admin.from("course_document_pdf_imports").select("id,status").eq("id", input.id).eq("document_id", input.documentId).maybeSingle();
    if (error || !job) throw new Error("NOT_FOUND");
    if (job.status !== "uploaded") return Response.json({ ok: true });
    const updated = await admin.from("course_document_pdf_imports").update({ status: "queued", stage: "대기", progress: 0, error_message: null, updated_at: new Date().toISOString() })
      .eq("id", job.id).eq("status", "uploaded").select("id");
    if (updated.error) throw new Error("PDF 변환을 시작하지 못했습니다.");
    if (updated.data?.length && process.env.PDF_CONVERTER !== "external") {
      try {
        const origin = process.env.APP_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(request.url).origin);
        await start(pdfConversionWorkflow, [job.id, origin]);
      } catch {
        await admin.from("course_document_pdf_imports").update({ status: "failed", stage: "실패", error_message: "PDF 변환을 시작하지 못했습니다. 다시 시도해 주세요." }).eq("id", job.id).eq("status", "queued");
        throw new Error("PDF 변환을 시작하지 못했습니다. 다시 시도해 주세요.");
      }
    }
    return Response.json({ ok: true });
  } catch (error) { return courseDocumentErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const input = z.object({ documentId: z.uuid(), id: z.uuid() }).parse(await request.json());
    const { admin } = await requirePdfDocument(input.documentId, request.headers.get("x-course-access-token"));
    const [{ data: job, error }, doc] = await Promise.all([
      admin.from("course_document_pdf_imports").select("source_path,status").eq("id", input.id).eq("document_id", input.documentId).maybeSingle(),
      admin.from("course_documents").select("content").eq("id", input.documentId).maybeSingle(),
    ]);
    if (error || doc.error) throw new Error("PDF 삭제 정보를 불러오지 못했습니다.");
    if (!job || !doc.data) throw new Error("NOT_FOUND");
    if (["processing", "queued"].includes(job.status)) return Response.json({ message: "변환이 끝난 뒤 삭제해 주세요." }, { status: 409 });
    if (JSON.stringify(doc.data.content).includes(input.id)) return Response.json({ message: "본문에서 이 PDF의 내용을 제거하고 저장한 뒤 삭제해 주세요." }, { status: 409 });
    const folder = job.source_path.slice(0, job.source_path.lastIndexOf("/"));
    const files = await admin.storage.from(PDF_BUCKET).list(folder, { limit: 1000 });
    if (files.error) throw new Error("PDF 파일 목록을 불러오지 못했습니다.");
    if (files.data.length) {
      const removed = await admin.storage.from(PDF_BUCKET).remove(files.data.map((file) => `${folder}/${file.name}`));
      if (removed.error) throw new Error("PDF 파일을 삭제하지 못했습니다. 다시 시도해 주세요.");
    }
    const removed = await admin.from("course_document_pdf_imports").delete().eq("id", input.id).eq("document_id", input.documentId);
    if (removed.error) throw new Error("PDF 변환 이력을 삭제하지 못했습니다.");
    return Response.json({ ok: true });
  } catch (error) { return courseDocumentErrorResponse(error); }
}
