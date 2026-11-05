import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { InstructorContractWriter } from "@/components/contracts/instructor-contract-writer";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import {
  InstructorContractError,
  loadInstructorContractCreationTemplates,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

export default async function NewInstructorContractPage() {
  const context = await requireInstructorContractContext().catch((error: unknown) => {
    if (error instanceof InstructorContractError && error.status === 401) redirect("/login");
    throw error;
  });
  const templates = await loadInstructorContractCreationTemplates(context.workspaceId);

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex min-h-16 w-full max-w-[1900px] flex-wrap items-center gap-3 px-5 py-3 lg:px-8">
          <Button variant="ghost" size="sm" asChild><BackLink href="/services/contracts"><ArrowLeft aria-hidden="true" />계약서 목록</BackLink></Button>
          <div className="h-5 w-px bg-border" />
          <h1 className="truncate font-semibold">새 계약서 생성</h1>
        </div>
      </header>
      <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
        <InstructorContractWriter templates={templates} />
      </div>
    </main>
  );
}
