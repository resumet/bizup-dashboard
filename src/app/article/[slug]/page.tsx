import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { DocumentRenderer } from "@/components/course-documents/document-renderer";
import { LeadGateForm } from "@/components/course-documents/lead-gate-form";
import { toDocumentDetail, unlockCookieName, verifyUnlockToken } from "@/lib/course-documents/server";
import { splitDocumentAtLeadGate } from "@/lib/course-documents/validation";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = { params: Promise<{ slug: string }> };

export default async function PublicCourseDocumentPage({ params }: Props) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin.from("course_documents").select("id,course_id,instructor_name,title,slug,content,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at,courses!inner(name)").eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`공개 문서 조회 실패: ${error.code}`);
  if (!data || data.status !== "published") notFound();
  const document = toDocumentDetail(data);
  const course = Array.isArray(data.courses) ? data.courses[0] : data.courses;
  const cookieStore = await cookies();
  const unlocked = verifyUnlockToken(cookieStore.get(unlockCookieName(document.id))?.value, document.id);
  const split = splitDocumentAtLeadGate(document.content, document.leadGateEnabled, document.leadGateAfterBlockId);
  const gated = document.leadGateEnabled && split.lockedBlocks.length > 0 && !unlocked;

  return <main className="min-h-screen bg-[#faf9f7] text-[#1d1d1f]"><header className="border-b border-black/10 bg-white/90"><div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5"><span className="truncate font-semibold">{course?.name ?? "강의"}</span><span className="text-sm text-black/55">{document.instructorName}</span></div></header><article className="mx-auto max-w-3xl px-5 py-12 sm:py-16"><h1 className="mb-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl">{document.title}</h1><p className="mb-10 text-sm text-black/50">{document.publishedAt ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(document.publishedAt)) : ""}</p><DocumentRenderer blocks={gated ? split.publicBlocks : document.content} />{gated ? <LeadGateForm slug={slug} /> : null}</article></main>;
}
