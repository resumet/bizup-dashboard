import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePdfDocument } from "@/lib/course-documents/pdf-server";
import { PDF_BUCKET } from "@/lib/course-documents/pdf";
import { unlockCookieName, verifyUnlockToken } from "@/lib/course-documents/server";
import { courseDocumentContentSchema, splitDocumentAtLeadGate } from "@/lib/course-documents/validation";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string; asset: string }> }) {
  try {
    const { jobId, asset } = await params;
    z.uuid().parse(jobId);
    if (!/^p\d+-\d+\.png$/u.test(asset)) return new Response(null, { status: 404 });
    const admin = createAdminClient();
    const { data: job } = await admin.from("course_document_pdf_imports").select("document_id,source_path").eq("id", jobId).maybeSingle();
    if (!job) return new Response(null, { status: 404 });
    const jar = await cookies();
    let allowed = false;
    try {
      await requirePdfDocument(job.document_id, jar.get(`pdf_course_${job.document_id}`)?.value);
      allowed = true;
    } catch { /* Published article readers use the article's existing lead gate. */ }
    if (!allowed) {
      const { data: doc } = await admin.from("course_documents").select("id,content,lead_gate_enabled,lead_gate_after_block_id")
        .eq("id", job.document_id).eq("status", "published").is("deleted_at", null).maybeSingle();
      if (doc) {
        const blocks = courseDocumentContentSchema.parse(doc.content);
        const visible = verifyUnlockToken(jar.get(unlockCookieName(doc.id))?.value, doc.id) ? blocks
          : splitDocumentAtLeadGate(blocks, doc.lead_gate_enabled, doc.lead_gate_after_block_id).publicBlocks;
        const target = new URL(request.url).pathname;
        const containsAsset = (value: unknown): boolean => {
          if (!value || typeof value !== "object") return false;
          const node = value as { type?: string; attrs?: { src?: string }; content?: unknown[]; url?: string };
          const source = node.type === "image" ? node.attrs?.src ?? node.url : null;
          if (source) { try { if (new URL(source).pathname === target) return true; } catch { /* Invalid URL. */ } }
          return Array.isArray(node.content) ? node.content.some(containsAsset) : containsAsset(node.content);
        };
        allowed = visible.some(containsAsset);
      }
    }
    if (!allowed) return new Response(null, { status: 404 });
    const path = `${job.source_path.slice(0, job.source_path.lastIndexOf("/"))}/${asset}`;
    const { data, error } = await admin.storage.from(PDF_BUCKET).download(path);
    if (error || !data) return new Response(null, { status: 404 });
    return new Response(await data.arrayBuffer(), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 404 }); }
}
