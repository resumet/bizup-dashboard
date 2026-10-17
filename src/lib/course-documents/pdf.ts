import { z } from "zod";
import type { RichTextNode } from "./types";

export const PDF_BUCKET = "course-document-pdfs";
export const PDF_MAX_BYTES = 50 * 1024 * 1024;
export const pdfOptionsSchema = z.object({
  mode: z.enum(["structure", "reading"]).default("structure"),
  ocr: z.boolean().default(false),
  images: z.boolean().default(true),
});
export type PdfSource = {
  page: number; bbox: number[]; confidence: number; method: string;
};
export type PdfBlock = {
  id: string; node: RichTextNode; source: PdfSource; issues: string[];
};
export type PdfResult = {
  version: 1; title: string; pageCount: number; blocks: PdfBlock[];
  outline: { title: string; level: number; page: number; blockId: string }[];
};
export type PdfImport = {
  id: string; file_name: string; status: string; stage: string; progress: number;
  error_message: string | null; result: PdfResult | null; created_at: string;
};
export function pdfText(node: RichTextNode): string {
  return node.text ?? (node.content ?? []).map(pdfText).join(" ");
}
export function validatePdfFile(file: Pick<File, "name" | "type" | "size">, maxBytes = PDF_MAX_BYTES) {
  if (!/\.pdf$/iu.test(file.name) || (file.type && file.type !== "application/pdf")) throw new Error("PDF 파일만 업로드할 수 있습니다.");
  if (!file.size || file.size > Math.min(maxBytes, PDF_MAX_BYTES)) throw new Error(`PDF 파일은 ${Math.min(maxBytes, PDF_MAX_BYTES) / 1024 / 1024}MB까지 업로드할 수 있습니다.`);
}
export function pdfNodes(result: PdfResult, jobId: string): RichTextNode[] {
  return result.blocks.map((block) => ({ ...block.node, attrs: {
    ...block.node.attrs, blockId: block.id, sourceJobId: jobId,
    sourcePage: block.source.page, sourceBbox: block.source.bbox,
    sourceConfidence: block.source.confidence, extractionMethod: block.source.method,
    userEdited: false,
  } }));
}
