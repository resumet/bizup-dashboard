import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { InstructorContractTemplateManager } from "@/components/contracts/instructor-contract-template-manager";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import {
  InstructorContractError,
  loadInstructorContractTemplates,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

export default async function InstructorContractTemplatesPage() {
  const context = await requireInstructorContractContext().catch((error: unknown) => {
    if (error instanceof InstructorContractError && error.status === 401) redirect("/login");
    throw error;
  });
  if (!context.isAdmin) redirect("/services/contracts");
  const templates = await loadInstructorContractTemplates(context.workspaceId);

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 sm:p-7 lg:p-9">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" asChild><BackLink href="/services/contracts"><ArrowLeft aria-hidden="true" />계약서 목록</BackLink></Button>
          <div className="h-5 w-px bg-border" />
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">계약서 템플릿 관리</h1>
        </div>
        <InstructorContractTemplateManager initialTemplates={templates} />
      </div>
    </main>
  );
}
