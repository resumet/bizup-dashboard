import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { InstructorContractError, loadCompletedInstructorContracts, requireInstructorContractContext } from "@/lib/contracts/instructor-contract-template-server";

const dateTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function CompletedInstructorContractsPage() {
  const context = await requireInstructorContractContext().catch((error: unknown) => {
    if (error instanceof InstructorContractError && error.status === 401) redirect("/login");
    throw error;
  });
  const contracts = await loadCompletedInstructorContracts(context);
  return (
    <main className="min-h-screen"><div className="mx-auto w-full max-w-[1200px] space-y-6 p-5 sm:p-7 lg:p-9">
      <div className="flex flex-wrap items-center gap-3"><Button variant="ghost" size="sm" asChild><BackLink href="/services/contracts"><ArrowLeft aria-hidden="true" />계약서 목록</BackLink></Button><div className="h-5 w-px bg-border" /><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">계약완료함</h1></div>
      {contracts.length ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">{contracts.map((contract) => <li key={contract.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><Link href={`/services/contracts/${contract.id}`} className="flex items-center gap-2 font-semibold hover:text-primary hover:underline"><FileText className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{contract.title}</span></Link><p className="mt-1 text-sm text-muted-foreground">{contract.instructorName || "-"} · {contract.lectureName || "-"}</p></div><span className="inline-flex shrink-0 items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="size-4" aria-hidden="true" />{contract.signedAt ? dateTime.format(new Date(contract.signedAt)) : "완료"}</span></li>)}</ul> : <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-center text-muted-foreground"><CheckCircle2 className="size-10" aria-hidden="true" /><p>완료된 전자계약이 없습니다.</p></div>}
    </div></main>
  );
}
