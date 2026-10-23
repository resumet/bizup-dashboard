import { Download, FileDown } from "lucide-react";

import { AdPerformanceOutcomeCard } from "@/components/ad-performance/ad-performance-outcome-card";
import { AdPerformanceSummaryCards } from "@/components/ad-performance/ad-performance-summary-cards";
import { Button } from "@/components/ui/button";
import type { AdPerformanceDashboardData } from "@/lib/ad-performance/types";
import type { ExternalMarketingProject } from "@/lib/external-marketing/model";
import { PublicExternalMarketingReportTable } from "./public-report-table";
import { PublicExternalMarketingProjectInfo } from "./public-project-info";

export function PublicExternalMarketingReport({ project, dashboard }: {
  project: ExternalMarketingProject;
  dashboard: AdPerformanceDashboardData;
}) {
  const exportBase = `/api/public/external-marketing/report/${project.publicToken}`;

  return (
    <main className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8 lg:py-12">
        <header className="flex flex-col justify-between gap-5 border-b pb-6 lg:flex-row lg:items-end">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {project.courseName || "광고집행 결과"}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`${exportBase}/xlsx`} download><Download />엑셀 다운로드</a>
            </Button>
            <Button asChild>
              <a href={`${exportBase}/pdf`} download><FileDown />PDF 다운로드</a>
            </Button>
          </div>
        </header>

        <PublicExternalMarketingProjectInfo token={project.publicToken} startDate={dashboard.startDate} initialInfo={{
          courseName: project.courseName, instructorName: project.instructorName,
          affiliateName: project.affiliateName, projectManager: project.projectManager, cohort: project.cohort,
          webinarDate: project.webinarDate,
          creativeDriveUrl: project.creativeDriveUrl, previousCohortCreativeNotionUrl: project.previousCohortCreativeNotionUrl, landingPages: project.landingPages,
        }} />

        <AdPerformanceSummaryCards metrics={dashboard.metrics} totalBudget={dashboard.totalBudget} organicChannels={dashboard.organicChannels} />
        <AdPerformanceOutcomeCard metrics={dashboard.metrics} />
        <section className="mt-8">
          <h2 className="mb-4 text-xl font-semibold tracking-tight">광고집행 결과</h2>
          <PublicExternalMarketingReportTable metrics={dashboard.metrics} token={project.publicToken} />
        </section>
      </div>
    </main>
  );
}
