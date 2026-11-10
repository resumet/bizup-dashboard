import { ArrowLeft, FilePlus2, FileText, LayoutTemplate, UsersRound } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/layout/back-link";
import { InstructorContractDeleteButton } from "@/components/contracts/instructor-contract-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  InstructorContractError,
  loadInstructorContracts,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function ContractsPage() {
  const context = await requireInstructorContractContext().catch((error: unknown) => {
    if (error instanceof InstructorContractError && error.status === 401) redirect("/login");
    throw error;
  });
  const contracts = await loadInstructorContracts(context);

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 sm:p-7 lg:p-9">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <BackLink href="/services/tools"><ArrowLeft aria-hidden="true" />유용한 도구들</BackLink>
            </Button>
            <div className="h-5 w-px bg-border" />
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">계약서</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/services/contracts/instructors"><UsersRound aria-hidden="true" />강사 정보</Link>
            </Button>
            {context.isAdmin ? (
              <Button variant="outline" asChild>
                <Link href="/services/contracts/templates"><LayoutTemplate aria-hidden="true" />계약서 템플릿 관리</Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link href="/services/contracts/new"><FilePlus2 aria-hidden="true" />새로운 계약서 생성</Link>
            </Button>
          </div>
        </div>
        {contracts.length ? (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div aria-hidden="true" className="hidden grid-cols-[minmax(15rem,2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(10rem,1.2fr)_minmax(7rem,0.8fr)_10rem] gap-4 border-b bg-muted/40 px-5 py-3 text-xs font-medium text-muted-foreground xl:grid">
              <span>계약서</span>
              <span>템플릿</span>
              <span>강사명</span>
              <span>강의명</span>
              <span>작성자</span>
              <span>작성 시간</span>
            </div>
            <ul className="divide-y">
              {contracts.map((contract) => (
                <li
                  key={contract.id}
                  className="grid gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-muted/30 focus-within:bg-muted/30 sm:grid-cols-2 sm:px-5 xl:grid-cols-[minmax(15rem,2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(10rem,1.2fr)_minmax(7rem,0.8fr)_10rem] xl:items-center"
                >
                  <div className="flex min-w-0 items-center gap-1 sm:col-span-2 xl:col-span-1">
                    <Link
                      className="flex min-w-0 items-center gap-2 font-semibold leading-6 hover:text-primary hover:underline"
                      href={`/services/contracts/${contract.id}`}
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{contract.title}</span>
                    </Link>
                    {context.isAdmin || contract.createdById === context.user.id ? <InstructorContractDeleteButton id={contract.id} title={contract.title} /> : null}
                  </div>
                  <div className="min-w-0">
                    <span className="mb-1 block text-xs text-muted-foreground xl:sr-only">템플릿</span>
                    <Badge variant="secondary" className="max-w-full"><span className="truncate">{contract.templateName}</span></Badge>
                  </div>
                  <div className="min-w-0 text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground xl:sr-only">강사명</span>
                    <span className="block truncate">{contract.instructorName || "-"}</span>
                  </div>
                  <div className="min-w-0 text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground xl:sr-only">강의명</span>
                    <span className="block truncate">{contract.lectureName || "-"}</span>
                  </div>
                  <div className="min-w-0 text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground xl:sr-only">작성자</span>
                    <span className="block truncate">{contract.createdByName}</span>
                  </div>
                  <div className="text-sm">
                    <span className="mb-1 block text-xs text-muted-foreground xl:sr-only">작성 시간</span>
                    <span className="whitespace-nowrap">{dateTime.format(new Date(contract.createdAt))}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 text-center text-muted-foreground">
            <FileText className="size-10" aria-hidden="true" />
            <p>작성된 계약서가 없습니다.</p>
            <Button variant="outline" asChild><Link href="/services/contracts/new"><FilePlus2 aria-hidden="true" />첫 계약서 만들기</Link></Button>
          </div>
        )}
      </div>
    </main>
  );
}

