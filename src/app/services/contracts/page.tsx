import { ArrowLeft, FilePlus2, FileText, LayoutTemplate } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {contracts.map((contract) => (
              <Card key={contract.id} className="py-0 transition-shadow hover:shadow-md">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <Link className="min-w-0 font-semibold leading-6 hover:text-primary hover:underline" href={`/services/contracts/${contract.id}`}>
                      {contract.title}
                    </Link>
                    <Badge variant="secondary" className="shrink-0">{contract.templateName}</Badge>
                  </div>
                  <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">강사명</dt><dd className="truncate">{contract.instructorName || "-"}</dd>
                    <dt className="text-muted-foreground">강의명</dt><dd className="truncate">{contract.lectureName || "-"}</dd>
                    <dt className="text-muted-foreground">작성자</dt><dd className="truncate">{contract.createdByName}</dd>
                    <dt className="text-muted-foreground">작성 시간</dt><dd className="whitespace-nowrap">{dateTime.format(new Date(contract.createdAt))}</dd>
                  </dl>
                </CardContent>
              </Card>
            ))}
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
