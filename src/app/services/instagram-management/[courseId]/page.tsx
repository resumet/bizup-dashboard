import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { InstagramManagementWorkspace } from "@/components/course-documents/instagram-management-workspace";
import { BackLink } from "@/components/layout/back-link";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";

export default async function InstagramManagementCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  if (!z.uuid().safeParse(courseId).success) notFound();

  const { admin, membership } = await requireCourseDocumentMember().catch((error) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    throw error;
  });
  const { data: course, error } = await admin
    .from("courses")
    .select("id")
    .eq("id", courseId)
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();
  if (error) throw new Error(`강의를 불러오지 못했습니다: ${error.code}`);
  if (!course) notFound();

  return (
    <main className="mx-auto max-w-[1900px] space-y-6 px-5 py-8 lg:px-8">
      <BackLink href="/services/instagram-management" className="text-sm hover:underline">
        ← 강사 인스타그램 관리
      </BackLink>
      <InstagramManagementWorkspace courseId={courseId} />
    </main>
  );
}
