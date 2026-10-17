import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PDF_BUCKET, PDF_MAX_BYTES, pdfNodes, pdfOptionsSchema, type PdfResult } from "./pdf";
import { courseDocumentContentSchema } from "./validation";
import { richTextDocumentToBlocks } from "./rich-text";

const DIRECTORY = "/tmp/bizup-pdf";
const PYTHON = `${DIRECTORY}/venv/bin/python`;
const provenanceSchema = z.object({ page: z.number().int().min(1).max(100), bbox: z.array(z.number()).length(4), confidence: z.number().min(0).max(1), method: z.enum(["text", "ocr"]) });

export async function convertPdfInSandbox(id: string, origin: string) {
  const admin = createAdminClient();
  const claimed = await admin.rpc("claim_course_document_pdf_import", { p_id: id });
  if (claimed.error) throw new Error("PDF 작업을 가져오지 못했습니다.");
  const job = claimed.data?.[0];
  if (!job) return;
  let sandbox: Sandbox | undefined;
  async function update(fields: Record<string, unknown>) {
    const { data, error } = await admin.from("course_document_pdf_imports")
      .update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id)
      .eq("lease_token", job.lease_token).eq("status", "processing").select("id");
    if (error) throw new Error("PDF 변환 상태를 저장하지 못했습니다.");
    if (!data?.length) throw new Error("LEASE_LOST");
  }
  console.info("[pdf-conversion] started", { id });
  try {
    const source = await admin.storage.from(PDF_BUCKET).download(job.source_path);
    if (source.error || !source.data) throw new Error("업로드된 PDF를 찾을 수 없습니다. 다시 업로드해 주세요.");
    if (source.data.size > Math.min(Number(process.env.PDF_MAX_FILE_BYTES) || PDF_MAX_BYTES, PDF_MAX_BYTES) || source.data.size !== job.file_size) throw new Error("PDF 파일 크기가 올바르지 않습니다.");
    const bytes = Buffer.from(await source.data.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-" || createHash("sha256").update(bytes).digest("hex") !== job.sha256) throw new Error("PDF 형식 또는 파일 무결성이 올바르지 않습니다. 다시 업로드해 주세요.");
    const options = pdfOptionsSchema.parse(job.options);
    await update({ stage: "실행 환경 준비", progress: 12 });
    sandbox = await Sandbox.create({ image: "vercel/sandbox/universal", persistent: false, resources: { vcpus: 1 }, timeout: 9 * 60_000, signal: AbortSignal.timeout(30_000) });
    const [converter, requirements] = await Promise.all([
      readFile(path.join(process.cwd(), "pdf-worker/convert.py")),
      readFile(path.join(process.cwd(), "pdf-worker/requirements.txt")),
    ]);
    await sandbox.writeFiles([
      { path: `${DIRECTORY}/convert.py`, content: converter },
      { path: `${DIRECTORY}/requirements.txt`, content: requirements },
      { path: `${DIRECTORY}/source.pdf`, content: bytes },
    ]);
    const venv = await sandbox.runCommand({ cmd: "python3", args: ["-m", "venv", `${DIRECTORY}/venv`], timeoutMs: 20_000 });
    if (venv.exitCode !== 0) throw new Error("PDF 변환 환경을 준비하지 못했습니다.");
    const install = await sandbox.runCommand({ cmd: PYTHON, args: ["-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir", "-r", `${DIRECTORY}/requirements.txt`], timeoutMs: 120_000 });
    if (install.exitCode !== 0) throw new Error("PDF 변환 도구를 설치하지 못했습니다. 다시 시도해 주세요.");
    if (options.ocr) {
      const apt = await sandbox.runCommand({ cmd: "apt-get", args: ["update", "-qq"], sudo: true, timeoutMs: 45_000 });
      if (apt.exitCode !== 0) throw new Error("OCR 환경을 준비하지 못했습니다. OCR 옵션을 끄거나 다시 시도해 주세요.");
      const ocr = await sandbox.runCommand({ cmd: "apt-get", args: ["install", "-y", "--no-install-recommends", "tesseract-ocr", "tesseract-ocr-kor", "tesseract-ocr-eng"], sudo: true, timeoutMs: 90_000 });
      if (ocr.exitCode !== 0) throw new Error("OCR 언어 데이터를 설치하지 못했습니다.");
    }
    // PDF parsing has no service credentials and cannot make network requests.
    await sandbox.update({ networkPolicy: "deny-all" });
    const mkdir = await sandbox.runCommand({ cmd: "mkdir", args: ["-p", `${DIRECTORY}/result`] });
    if (mkdir.exitCode !== 0) throw new Error("PDF 결과 저장 공간을 준비하지 못했습니다.");
    await update({ stage: "분석", progress: 15 });
    const command = await sandbox.runCommand({ cmd: PYTHON, args: [`${DIRECTORY}/convert.py`, `${DIRECTORY}/source.pdf`, `${DIRECTORY}/result`, JSON.stringify(options), String(Math.min(Number(process.env.PDF_MAX_PAGES) || 100, 100))], detached: true, timeoutMs: 300_000 });
    let done = false;
    let exitCode: number | undefined;
    let commandError: unknown;
    const completed = command.wait().then((result) => { exitCode = result.exitCode; done = true; }).catch((error: unknown) => { commandError = error; done = true; });
    const started = Date.now();
    while (!done) {
      if (Date.now() - started > 310_000) throw new Error("PDF 변환 시간이 초과되었습니다. 파일을 나누어 다시 시도해 주세요.");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const progress = await sandbox.readFileToBuffer({ path: `${DIRECTORY}/result/progress.json` });
      let percent = 15;
      if (progress) {
        try { const state = JSON.parse(progress.toString()); percent = Math.max(15, Math.min(80, 15 + Math.floor(65 * state.page / state.total))); } catch { /* File may be in the middle of a write. */ }
      }
      await update({ stage: "변환", progress: percent });
    }
    await completed;
    if (commandError) throw new Error("PDF 변환 실행이 중단되었습니다. 다시 시도해 주세요.");
    if (exitCode !== 0) {
      const failure = await sandbox.readFileToBuffer({ path: `${DIRECTORY}/result/error.json` });
      throw new Error(failure ? String(JSON.parse(failure.toString()).message).slice(0, 500) : "PDF 분석에 실패했습니다. 파일을 확인해 주세요.");
    }
    const raw = await sandbox.readFileToBuffer({ path: `${DIRECTORY}/result/result.json` });
    if (!raw || raw.length > 8 * 1024 * 1024) throw new Error("PDF 변환 결과가 너무 큽니다. 파일을 나누어 주세요.");
    const result = JSON.parse(raw.toString()) as PdfResult;
    z.literal(1).parse(result.version);
    z.number().int().min(1).max(100).parse(result.pageCount);
    const assets = new Set<string>();
    for (const block of result.blocks) {
      provenanceSchema.parse(block.source);
      z.array(z.string().max(500)).max(30).parse(block.issues);
      if (block.node.type === "image") {
        const asset = z.string().regex(/^p\d+-\d+\.png$/u).parse(block.node.attrs?.src);
        assets.add(asset);
        block.node.attrs = { ...block.node.attrs, src: `${new URL(origin).origin}/api/course-document-pdfs/assets/${id}/${asset}` };
      }
    }
    // Use the same schema as the editor before writing any converted content.
    courseDocumentContentSchema.parse(richTextDocumentToBlocks({ content: pdfNodes(result, id) }));
    await update({ stage: "저장", progress: 85 });
    const folder = job.source_path.slice(0, job.source_path.lastIndexOf("/"));
    let assetBytes = 0;
    for (const asset of assets) {
      const image = await sandbox.readFileToBuffer({ path: `${DIRECTORY}/result/${asset}` });
      if (!image || (assetBytes += image.length) > 80 * 1024 * 1024) throw new Error("PDF 이미지 용량 한도를 초과했습니다.");
      const uploaded = await admin.storage.from(PDF_BUCKET).upload(`${folder}/${asset}`, image, { contentType: "image/png", upsert: true });
      if (uploaded.error) throw new Error("PDF 이미지를 저장하지 못했습니다.");
      await update({ stage: "저장", progress: 90 });
    }
    const saved = await admin.storage.from(PDF_BUCKET).upload(`${folder}/ir.json`, Buffer.from(JSON.stringify(result)), { contentType: "application/json", upsert: true });
    if (saved.error) throw new Error("PDF 변환 결과를 저장하지 못했습니다.");
    const review = result.blocks.some((block) => block.issues.length);
    await update({ status: review ? "needs_review" : "completed", stage: review ? "검수 필요" : "완료", progress: 100, result, error_message: null });
    console.info("[pdf-conversion] completed", { id, pages: result.pageCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 변환에 실패했습니다.";
    if (message !== "LEASE_LOST") {
      await update({ status: "failed", stage: "실패", error_message: /PDF|OCR|업로드/u.test(message) ? message.slice(0, 500) : "PDF 변환에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    }
    console.error("[pdf-conversion] failed", { id, type: error instanceof Error ? error.name : "Error" });
  } finally {
    if (sandbox) { try { await sandbox.delete(); } catch { console.error("[pdf-conversion] sandbox cleanup failed", { id }); } }
  }
}
