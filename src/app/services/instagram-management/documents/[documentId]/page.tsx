import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CourseDocumentEditor } from "@/components/course-documents/document-editor";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { requireCourseDocumentAdmin, toDocumentDetail } from "@/lib/course-documents/server";

type Props = { params: Promise<{ documentId: string }> };

export default async function AdminCourseDocumentPage({ params }: Props) {
  const { documentId } = await params;
  let context;
  try { context = await requireCourseDocumentAdmin(); }
  catch (error) { if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login"); throw error; }
  const { admin, membership } = context;
  const { data, error } = await admin.from("course_documents").select("id,course_id,instructor_name,title,slug,content,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at,courses!inner(name)").eq("id", documentId).eq("workspace_id", membership.workspace_id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`문서 조회 실패: ${error.code}`);
  if (!data) notFound();
  const course = Array.isArray(data.courses) ? data.courses[0] : data.courses;
  const document = toDocumentDetail(data);
  return <main className="min-h-screen"><header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8"><Button variant="ghost" size="icon" asChild><BackLink href="/services/instagram-management" aria-label="인스타그램 문서 목록으로 돌아가기"><ArrowLeft /></BackLink></Button><div className="mx-3 h-5 w-px bg-border" /><span className="truncate font-semibold">{document.title}</span></div></header><div className="mx-auto max-w-[1500px] px-5 py-8 lg:px-8"><CourseDocumentEditor mode="admin" courseId={document.courseId} courseName={course?.name ?? "강의"} document={document} /></div></main>;
}
