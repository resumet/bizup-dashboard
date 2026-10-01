import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { CourseDocumentEditor } from "@/components/course-documents/document-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getExternalCourse, toDocumentDetail } from "@/lib/course-documents/server";
import type { CourseDocumentDetail } from "@/lib/course-documents/types";

type Props = { params: Promise<{ accessToken: string; documentId: string }> };

export default async function ExternalDocumentPage({ params }: Props) {
  const { accessToken, documentId } = await params;
  let course: Awaited<ReturnType<typeof getExternalCourse>>["course"] | null = null;
  let document: CourseDocumentDetail | null = null;
  let missing = false;
  let message = "";
  try {
    const context = await getExternalCourse(accessToken);
    course = context.course;
    const [documentResult, materialResult] = await Promise.all([
      context.admin.from("course_documents").select("id,course_id,instructor_name,title,slug,content,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at").eq("id", documentId).eq("course_id", context.course.id).is("deleted_at", null).maybeSingle(),
      context.admin.from("course_instagram_materials").select("position").eq("course_id", context.course.id).eq("document_id", documentId).maybeSingle(),
    ]);
    const queryError = documentResult.error ?? materialResult.error;
    if (queryError) throw new Error(`문서 조회 실패: ${queryError.code}`);
    const data = documentResult.data;
    if (!data || !materialResult.data) missing = true;
    else document = toDocumentDetail(data);
  } catch (error) { message = error instanceof Error && error.message === "EXTERNAL_DISABLED" ? "현재 외부 문서 작성이 비활성화되어 있습니다." : "외부 작성 페이지를 찾을 수 없습니다."; }
  if (missing) notFound();
  if (!course || !document) return <main className="grid min-h-screen place-items-center bg-muted/20 p-5"><Alert className="max-w-lg" variant="destructive"><AlertDescription>{message}</AlertDescription></Alert></main>;
  return <main className="min-h-screen bg-muted/20"><header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1500px] items-center px-5"><Button variant="ghost" size="icon" asChild><Link href={`/write/${accessToken}`} aria-label="문서 목록으로 돌아가기"><ArrowLeft /></Link></Button><div className="mx-3 h-5 w-px bg-border" /><span className="truncate font-semibold">{document.title}</span></div></header><div className="mx-auto max-w-[1500px] px-5 py-8"><CourseDocumentEditor mode="external" courseId={course.id} courseName={course.name} accessToken={accessToken} document={document} fixedTitle /></div></main>;
}
