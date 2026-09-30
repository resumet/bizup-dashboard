import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { CourseDocumentEditor } from "@/components/course-documents/document-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getExternalCourse } from "@/lib/course-documents/server";

type Props = { params: Promise<{ accessToken: string }> };

export default async function NewExternalDocumentPage({ params }: Props) {
  const { accessToken } = await params;
  let course: Awaited<ReturnType<typeof getExternalCourse>>["course"] | null = null;
  let message = "";
  try { course = (await getExternalCourse(accessToken)).course; }
  catch (error) { message = error instanceof Error && error.message === "EXTERNAL_DISABLED" ? "현재 외부 문서 작성이 비활성화되어 있습니다." : "외부 작성 페이지를 찾을 수 없습니다."; }
  if (!course) return <main className="grid min-h-screen place-items-center bg-muted/20 p-5"><Alert className="max-w-lg" variant="destructive"><AlertDescription>{message}</AlertDescription></Alert></main>;
  return <main className="min-h-screen bg-muted/20"><header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1500px] items-center px-5"><Button variant="ghost" size="icon" asChild><Link href={`/write/${accessToken}`} aria-label="문서 목록으로 돌아가기"><ArrowLeft /></Link></Button><div className="mx-3 h-5 w-px bg-border" /><span className="truncate font-semibold">{course.name}</span></div></header><div className="mx-auto max-w-[1500px] px-5 py-8"><CourseDocumentEditor mode="external" courseId={course.id} courseName={course.name} accessToken={accessToken} /></div></main>;
}
