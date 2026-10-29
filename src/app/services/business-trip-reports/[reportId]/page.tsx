import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Download, FileText, Pencil } from "lucide-react";

import { DeleteBusinessTripReportButton } from "@/components/business-trip-reports/delete-report-button";
import { BusinessTripPaymentStatusBadge } from "@/components/business-trip-reports/payment-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BusinessTripReportError,
  loadBusinessTripReport,
  requireBusinessTripReportContext,
} from "@/lib/business-trip-reports/server";

const money = new Intl.NumberFormat("ko-KR");
const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function fileSize(value: number | null) {
  if (value === null) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))}KB`;
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}

export default async function BusinessTripReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const context = await requireBusinessTripReportContext().catch((error: unknown) => {
    if (error instanceof BusinessTripReportError && error.status === 401) redirect("/login");
    throw error;
  });
  const { reportId } = await params;
  const report = await loadBusinessTripReport(context, reportId).catch((error: unknown) => {
    if (error instanceof BusinessTripReportError && error.status === 404) notFound();
    throw error;
  });

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1200px] space-y-6 p-5 sm:p-7 lg:p-9">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{report.title}</h1>
            <BusinessTripPaymentStatusBadge completed={report.paymentCompleted} />
          </div>
          {report.canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`/services/business-trip-reports/${report.id}/edit`}><Pencil aria-hidden="true" />수정</Link>
              </Button>
              <DeleteBusinessTripReportButton reportId={report.id} title={report.title} version={report.version} />
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardContent><p className="text-sm text-muted-foreground">작성자</p><p className="mt-2 font-semibold">{report.authorName}</p></CardContent></Card>
          <Card><CardContent><p className="text-sm text-muted-foreground">작성 시간</p><p className="mt-2 font-semibold">{dateTime.format(new Date(report.createdAt))}</p></CardContent></Card>
          <Card><CardContent><p className="text-sm text-muted-foreground">최종 비용</p><p className="mt-2 text-xl font-semibold tabular-nums">{money.format(report.finalCost)}원</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="border-b"><CardTitle>출장보고서 파일</CardTitle></CardHeader>
          <CardContent>
            {report.fileName ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><FileText aria-hidden="true" /></span>
                  <div className="min-w-0"><p className="truncate font-medium">{report.fileName}</p><p className="text-xs text-muted-foreground">{fileSize(report.fileSize)}</p></div>
                </div>
                <Button asChild><a href={`/api/business-trip-reports/${report.id}/file`}><Download aria-hidden="true" />다운로드</a></Button>
              </div>
            ) : <p className="text-sm text-muted-foreground">업로드된 출장보고서 파일이 없습니다.</p>}
          </CardContent>
        </Card>

        <Button variant="outline" asChild><Link href="/services/business-trip-reports">목록으로</Link></Button>
      </div>
    </main>
  );
}
