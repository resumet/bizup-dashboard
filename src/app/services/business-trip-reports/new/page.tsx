import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BusinessTripReportForm } from "@/components/business-trip-reports/report-form";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import {
  BusinessTripReportError,
  requireBusinessTripReportContext,
} from "@/lib/business-trip-reports/server";

export default async function NewBusinessTripReportPage() {
  const context = await requireBusinessTripReportContext().catch((error: unknown) => {
    if (error instanceof BusinessTripReportError && error.status === 401) redirect("/login");
    throw error;
  });

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <BackLink href="/services/business-trip-reports">
              <ArrowLeft aria-hidden="true" />
              돌아가기
            </BackLink>
          </Button>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1900px] space-y-6 px-5 py-8 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">출장보고 작성</h1>
        <BusinessTripReportForm canUpdatePaymentStatus={context.isSuperAdmin} />
      </div>
    </main>
  );
}
