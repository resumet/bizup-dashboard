import { FileText } from "lucide-react";

import { ExternalDocumentList } from "@/components/course-documents/external-document-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getExternalCourse, toDocumentSummary } from "@/lib/course-documents/server";

type Props = { params: Promise<{ accessToken: string }> };

export default async function ExternalWriterPage({ params }: Props) {
  const { accessToken } = await params;
  let result: Awaited<ReturnType<typeof getExternalCourse>> | null = null;
  let documents: ReturnType<typeof toDocumentSummary>[] = [];
  let message = "";
  try {
    result = await getExternalCourse(accessToken);
    const { data, error } = await result.admin.from("course_documents").select("id,course_id,instructor_name,title,slug,status,lead_gate_enabled,lead_gate_after_block_id,created_at,updated_at,published_at").eq("course_id", result.course.id).is("deleted_at", null).order("updated_at", { ascending: false });
    if (error) throw new Error(`문서 목록 조회 실패: ${error.code}`);
    documents = (data ?? []).map((row) => toDocumentSummary(row));
  } catch (error) {
    message = error instanceof Error && error.message === "EXTERNAL_DISABLED" ? "현재 외부 문서 작성이 비활성화되어 있습니다." : "외부 작성 페이지를 찾을 수 없습니다.";
  }
  if (!result) return <main className="grid min-h-screen place-items-center bg-muted/20 p-5"><Alert className="max-w-lg" variant="destructive"><AlertDescription>{message}</AlertDescription></Alert></main>;
  return <main className="min-h-screen bg-muted/20"><header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-5xl items-center gap-3 px-5"><span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground"><FileText className="size-4" /></span><span className="truncate font-semibold">{result.course.name}</span></div></header><div className="mx-auto max-w-5xl px-5 py-10"><h1 className="mb-6 text-3xl font-semibold tracking-tight">문서 목록</h1><ExternalDocumentList accessToken={accessToken} initialDocuments={documents} /></div></main>;
}
