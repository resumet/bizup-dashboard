import { redirect } from "next/navigation";

import { BusinessTripReportForm } from "@/components/business-trip-reports/report-form";
import {
  BusinessTripReportError,
  requireBusinessTripReportContext,
} from "@/lib/business-trip-reports/server";

export default async function NewBusinessTripReportPage() {
  await requireBusinessTripReportContext().catch((error: unknown) => {
    if (error instanceof BusinessTripReportError && error.status === 401) redirect("/login");
    throw error;
  });

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 sm:p-7 lg:p-9">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">출장보고 작성</h1>
        <BusinessTripReportForm />
      </div>
    </main>
  );
}
