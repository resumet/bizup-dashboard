import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InstructorContractViewer } from "@/components/contracts/instructor-contract-viewer";
import { InstructorContractPrintButton } from "@/components/contracts/instructor-contract-print-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InstructorContractError,
  loadInstructorContract,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function InstructorContractDetailPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const [{ contractId }, context] = await Promise.all([
    params,
    requireInstructorContractContext().catch((error: unknown) => {
      if (error instanceof InstructorContractError && error.status === 401) redirect("/login");
      throw error;
    }),
  ]);
  const contract = await loadInstructorContract(context, contractId).catch((error: unknown) => {
    if (error instanceof InstructorContractError && error.status === 404) notFound();
    throw error;
  });

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1200px] space-y-6 p-5 sm:p-7 lg:p-9">
        <div className="space-y-5">
          <Button variant="ghost" size="sm" asChild><Link href="/services/contracts"><ArrowLeft aria-hidden="true" />계약서 목록</Link></Button>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{contract.title}</h1>
            <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{contract.templateName}</Badge><InstructorContractPrintButton /></div>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <div className="flex gap-2"><dt>작성자</dt><dd className="font-medium text-foreground">{contract.createdByName}</dd></div>
            <div className="flex gap-2"><dt>작성 시간</dt><dd className="font-medium text-foreground">{dateTime.format(new Date(contract.createdAt))}</dd></div>
          </dl>
        </div>
        <InstructorContractViewer content={contract.renderedContent} />
      </div>
    </main>
  );
}

