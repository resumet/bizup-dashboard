import Link from "next/link";
import { Download, ExternalLink, FileDown } from "lucide-react";

import { AdPerformanceSummaryCards } from "@/components/ad-performance/ad-performance-summary-cards";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AdPerformanceDashboardData } from "@/lib/ad-performance/types";
import type { ExternalMarketingProject } from "@/lib/external-marketing/model";
import { PublicExternalMarketingReportTable } from "./public-report-table";

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

        <Card className="mt-6">
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-3 xl:grid-cols-6">
            <div>
              <p className="text-xs text-muted-foreground">강사명</p>
              <p className="mt-1 font-medium">{project.instructorName || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">기수</p>
              <p className="mt-1 font-medium">{project.cohort || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">광고 시작일</p>
              <p className="mt-1 font-medium tabular-nums">{dashboard.startDate}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">광고소재 드라이브</p>
              {project.creativeDriveUrl ? (
                <Link
                  href={project.creativeDriveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  드라이브 열기 <ExternalLink className="size-3.5" />
                </Link>
              ) : <p className="mt-1 font-medium">—</p>}
            </div>
            <div className="sm:col-span-3 xl:col-span-2">
              <p className="text-xs text-muted-foreground">채널별 랜딩페이지</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {project.landingPages.length ? project.landingPages.map((page, index) => (
                  <Button key={`${page.channel}-${index}`} variant="outline" size="sm" asChild>
                    <Link href={page.url} target="_blank" rel="noopener noreferrer">
                      {page.channel}<ExternalLink />
                    </Link>
                  </Button>
                )) : <span className="text-sm">—</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        <AdPerformanceSummaryCards metrics={dashboard.metrics} totalBudget={dashboard.totalBudget} organicChannels={dashboard.organicChannels} />
        <section className="mt-8">
          <h2 className="mb-4 text-xl font-semibold tracking-tight">광고집행 결과</h2>
          <PublicExternalMarketingReportTable metrics={dashboard.metrics} />
        </section>
      </div>
    </main>
  );
}
