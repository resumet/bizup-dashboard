import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicExternalMarketingReport } from "@/components/external-marketing/public-report";
import { loadPublicExternalMarketingReport } from "@/lib/external-marketing/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const report = await loadPublicExternalMarketingReport(token);
  return { title: report?.project.courseName ? `${report.project.courseName} 광고집행 결과` : "광고집행 결과", robots: { index: false, follow: false } };
}

export default async function PublicExternalMarketingReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await loadPublicExternalMarketingReport(token);
  if (!report) notFound();
  return <PublicExternalMarketingReport project={report.project} dashboard={report.dashboard} />;
}
