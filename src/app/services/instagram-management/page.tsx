import { redirect } from "next/navigation";

import { InstagramManagementWorkspace } from "@/components/course-documents/instagram-management-workspace";
import { BackLink } from "@/components/layout/back-link";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";

export default async function InstagramManagementPage() {
  await requireCourseDocumentMember().catch((error) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    throw error;
  });

  return (
    <main className="mx-auto max-w-[1900px] space-y-6 px-5 py-8 lg:px-8">
      <BackLink href="/work" className="text-sm hover:underline">
        ← 운영 워크스페이스
      </BackLink>
      <h1 className="text-2xl font-semibold">강사 인스타그램 관리</h1>
      <InstagramManagementWorkspace />
    </main>
  );
}
