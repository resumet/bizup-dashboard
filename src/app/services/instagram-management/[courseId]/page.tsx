import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { InstagramManagementWorkspace } from "@/components/course-documents/instagram-management-workspace";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";

export default async function InstagramCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();
  try {
    const { admin, membership } = await requireCourseDocumentMember();
    const { data, error } = await admin.from("courses").select("id").eq("id", courseId).eq("workspace_id", membership.workspace_id).maybeSingle();
    if (error) throw new Error("강의를 불러오지 못했습니다.");
    if (!data) notFound();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    throw error;
  }
  return <main className="mx-auto max-w-[1900px] space-y-6 px-5 py-8 lg:px-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/services/instagram-management" className="text-sm hover:underline">← 인스타그램 관리</Link>
      <Button asChild variant="outline"><a href={`/services/course-operations/${courseId}`} target="_blank" rel="noopener noreferrer" aria-label="강의 상세보기 (새 창)">강의 상세보기<ExternalLink /></a></Button>
    </div>
    <InstagramManagementWorkspace courseId={courseId} />
  </main>;
}
