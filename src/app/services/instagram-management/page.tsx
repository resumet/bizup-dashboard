import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { InstagramManagementWorkspace } from "@/components/course-documents/instagram-management-workspace";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { requireCourseDocumentAdmin } from "@/lib/course-documents/server";

export default async function InstagramManagementPage() {
  try {
    await requireCourseDocumentAdmin();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    throw error;
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="icon" asChild><BackLink href="/work" aria-label="운영 워크스페이스로 돌아가기"><ArrowLeft /></BackLink></Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">인스타그램 관리</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
        <h1 className="mb-6 text-3xl font-semibold tracking-tight">인스타그램 문서</h1>
        <InstagramManagementWorkspace />
      </div>
    </main>
  );
}
