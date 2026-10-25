import type { ExternalMarketingProjectSummary } from "@/lib/external-marketing/model";

export type DashboardExternalMarketingCourse = {
  dashboardId: string;
  courseName: string;
  instructorName: string;
  cohort: string;
  spend: number;
  landingLeads: number;
  landingLeadCost: number | null;
  adLeads: number;
  adLeadCost: number | null;
};

function unitCost(spend: number, count: number) {
  return count > 0 ? spend / count : null;
}

export function activeExternalMarketingCourses(
  projects: ExternalMarketingProjectSummary[],
): DashboardExternalMarketingCourse[] {
  return projects
    .filter((project) => project.advertisingStarted)
    .map((project) => ({
      dashboardId: project.dashboardId,
      courseName: project.courseName,
      instructorName: project.instructorName,
      cohort: project.cohort,
      spend: project.spend,
      landingLeads: project.paidLandingLeads,
      landingLeadCost: unitCost(project.spend, project.paidLandingLeads),
      adLeads: project.adLeads,
      adLeadCost: unitCost(project.spend, project.adLeads),
    }));
}
