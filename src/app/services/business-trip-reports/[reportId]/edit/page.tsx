import { notFound, redirect } from "next/navigation";

import { BusinessTripReportForm } from "@/components/business-trip-reports/report-form";
import {
  BusinessTripReportError,
  loadBusinessTripReport,
  requireBusinessTripReportContext,
} from "@/lib/business-trip-reports/server";

export default async function EditBusinessTripReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const context = await requireBusinessTripReportContext().catch((error: unknown) => {
    if (error instanceof BusinessTripReportError && error.status === 401) redirect("/login");
    throw error;
  });
  const { reportId } = await params;
  const report = await loadBusinessTripReport(context, reportId).catch((error: unknown) => {
    if (error instanceof BusinessTripReportError && error.status === 404) notFound();
    throw error;
  });
  if (!report.canManage) notFound();

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 sm:p-7 lg:p-9">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">출장보고서 수정</h1>
        <BusinessTripReportForm initialReport={report} />
      </div>
    </main>
  );
}
