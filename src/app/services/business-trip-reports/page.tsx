import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FilePlus2, FileText } from "lucide-react";

import { BusinessTripPaymentStatusBadge } from "@/components/business-trip-reports/payment-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BusinessTripReportError,
  loadBusinessTripReports,
  requireBusinessTripReportContext,
} from "@/lib/business-trip-reports/server";

const money = new Intl.NumberFormat("ko-KR");
const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function BusinessTripReportsPage() {
  const context = await requireBusinessTripReportContext().catch((error: unknown) => {
    if (error instanceof BusinessTripReportError && error.status === 401) redirect("/login");
    throw error;
  });
  const reports = await loadBusinessTripReports(context);

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 sm:p-7 lg:p-9">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">출장보고서</h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href="/templates/business-trip-report-template.docx" download="출장보고서_최종.docx">
                <Download aria-hidden="true" />
                출장보고서 양식
              </a>
            </Button>
            <Button asChild>
              <Link href="/services/business-trip-reports/new">
                <FilePlus2 aria-hidden="true" />
                출장보고 작성
              </Link>
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            {reports.length ? (
              <div className="overflow-x-auto">
                <Table className="min-w-[920px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">제목</TableHead>
                      <TableHead className="w-32">작성자</TableHead>
                      <TableHead className="w-48">작성 시간</TableHead>
                      <TableHead className="w-36 text-right">최종 비용</TableHead>
                      <TableHead className="w-36">첨부파일</TableHead>
                      <TableHead className="w-28 pr-5">지급 상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="pl-5 font-medium">
                          <Link href={`/services/business-trip-reports/${report.id}`} className="hover:text-primary hover:underline">
                            {report.title}
                          </Link>
                        </TableCell>
                        <TableCell>{report.authorName}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{dateTime.format(new Date(report.createdAt))}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{money.format(report.finalCost)}원</TableCell>
                        <TableCell className="max-w-40 truncate text-muted-foreground">{report.fileName ?? "-"}</TableCell>
                        <TableCell className="pr-5"><BusinessTripPaymentStatusBadge completed={report.paymentCompleted} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
                <FileText className="size-10" aria-hidden="true" />
                <p>작성된 출장보고서가 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
