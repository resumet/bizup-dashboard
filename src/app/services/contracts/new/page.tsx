import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { InstructorContractWriter } from "@/components/contracts/instructor-contract-writer";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { loadInstructorContractDraft } from "@/lib/contracts/instructor-contract-draft-server";
import {
  InstructorContractError,
  loadInstructorContractCreationTemplates,
  loadInstructorContractParties,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

export default async function NewInstructorContractPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const context = await requireInstructorContractContext().catch((error: unknown) => {
    if (error instanceof InstructorContractError && error.status === 401) redirect("/login");
    throw error;
  });
  const { draft: draftMode } = await searchParams;
  const [templates, draft, parties] = await Promise.all([
    loadInstructorContractCreationTemplates(context.workspaceId),
    draftMode === "resume" ? loadInstructorContractDraft(context.workspaceId, context.user.id) : Promise.resolve(null),
    loadInstructorContractParties(context),
  ]);

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
        <InstructorContractWriter templates={templates} parties={parties} initialDraft={draft?.values} initialDraftUpdatedAt={draft?.updatedAt} />
      </div>
    </main>
  );
}
