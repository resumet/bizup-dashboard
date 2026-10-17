async function convert(id: string, origin: string) {
  "use step";
  const { convertPdfInSandbox } = await import("@/lib/course-documents/pdf-sandbox");
  await convertPdfInSandbox(id, origin);
}
convert.maxRetries = 0;

async function fail(id: string) {
  "use step";
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { error } = await createAdminClient().from("course_document_pdf_imports")
    .update({ status: "failed", stage: "실패", error_message: "PDF 변환 실행이 중단되었습니다. 다시 시도해 주세요.", updated_at: new Date().toISOString() })
    .eq("id", id).in("status", ["queued", "processing"]);
  if (error) throw new Error("PDF 작업 실패 상태를 저장하지 못했습니다.");
  console.error("[pdf-conversion] workflow interrupted", { id });
}

export async function pdfConversionWorkflow(id: string, origin: string) {
  "use workflow";
  try { await convert(id, origin); }
  catch { await fail(id); }
}
