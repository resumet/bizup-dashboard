import { redirect } from "next/navigation";

import { InstagramChecklistTemplateManager } from "@/components/course-documents/instagram-checklist-template-manager";
import { BackLink } from "@/components/layout/back-link";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";

export default async function InstagramChecklistTemplatePage() {
  await requireCourseDocumentMember().catch((error) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    throw error;
  });

  return <main className="mx-auto max-w-4xl space-y-6 px-5 py-8 lg:px-8">
    <BackLink href="/services/content-management?tab=instagram" className="text-sm hover:underline">← 인스타그램 관리</BackLink>
    <h1 className="text-2xl font-semibold">인스타그램 체크리스트 템플릿</h1>
    <InstagramChecklistTemplateManager />
  </main>;
}
