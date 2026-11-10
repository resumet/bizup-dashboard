import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { InstructorContractInstructorManager } from "@/components/contracts/instructor-contract-instructor-manager";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { InstructorContractError, loadInstructorContractInstructors, requireInstructorContractContext } from "@/lib/contracts/instructor-contract-template-server";

export default async function InstructorContractInstructorsPage() {
  const context = await requireInstructorContractContext().catch((error: unknown) => {
    if (error instanceof InstructorContractError && error.status === 401) redirect("/login");
    if (error instanceof InstructorContractError && error.status === 403) notFound();
    throw error;
  });
  const instructors = await loadInstructorContractInstructors(context);
  return <main className="min-h-screen"><div className="mx-auto w-full max-w-4xl space-y-6 p-5 sm:p-7 lg:p-9"><div className="flex items-center gap-3"><Button variant="ghost" size="sm" asChild><BackLink href="/services/contracts"><ArrowLeft aria-hidden="true" />계약서 목록</BackLink></Button><div className="h-5 w-px bg-border" /><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">강사 정보</h1></div><InstructorContractInstructorManager initialInstructors={instructors} /></div></main>;
}
