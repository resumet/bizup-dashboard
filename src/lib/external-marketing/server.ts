import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sortExternalMarketingProjects } from "./wbs";
import { loadAdPerformanceDashboard } from "@/lib/ad-performance/server";
import type { AdPerformanceDashboardData } from "@/lib/ad-performance/types";
import {
  externalMarketingInfoSchema,
  externalMarketingTokenSchema,
  type ExternalMarketingProject,
  type ExternalMarketingProjectSummary,
} from "./model";

type ProjectRow = {
  dashboard_id: string;
  workspace_id: string;
  course_name: string;
  instructor_name: string;
  affiliate_name: string;
  project_manager: string;
  cohort: string;
  webinar_date: string | null;
  landing_pages: unknown;
  creative_drive_url: string;
  previous_cohort_creative_notion_url: string;
  public_token: string;
  public_enabled: boolean;
  advertising_started: boolean;
  updated_at: string;
  created_at: string;
};

function normalizeProject(row: ProjectRow): ExternalMarketingProject {
  const info = externalMarketingInfoSchema.parse({
    courseName: row.course_name,
    instructorName: row.instructor_name,
    affiliateName: row.affiliate_name,
    projectManager: row.project_manager,
    cohort: row.cohort,
    webinarDate: row.webinar_date ?? "",
    landingPages: row.landing_pages,
    creativeDriveUrl: row.creative_drive_url,
    previousCohortCreativeNotionUrl: row.previous_cohort_creative_notion_url,
  });
  return {
    ...info,
    dashboardId: row.dashboard_id,
    workspaceId: row.workspace_id,
    publicToken: row.public_token,
    publicEnabled: row.public_enabled,
    advertisingStarted: row.advertising_started,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

const projectColumns = "dashboard_id,workspace_id,course_name,instructor_name,affiliate_name,project_manager,cohort,webinar_date,landing_pages,creative_drive_url,previous_cohort_creative_notion_url,public_token,public_enabled,advertising_started,created_at,updated_at";

export async function loadExternalMarketingProjects(workspaceId: string) {
  const admin = createAdminClient();
  const [projectsResult, summariesResult] = await Promise.all([
    admin.from("external_marketing_projects").select(projectColumns).eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
    admin.from("ad_performance_dashboard_summaries").select("id,start_date,total_budget,metric_count,spend,paid_landing_leads,organic_landing_leads").eq("workspace_id", workspaceId).eq("service_scope", "external_marketing"),
  ]);
  if (projectsResult.error) throw new Error(`외부마케팅대행 목록 조회 실패: ${projectsResult.error.code}`);
  if (summariesResult.error) throw new Error(`광고성과 요약 조회 실패: ${summariesResult.error.code}`);
  const summaries = new Map((summariesResult.data ?? []).map((row) => [row.id as string, row]));
  const projects = ((projectsResult.data ?? []) as ProjectRow[]).flatMap<ExternalMarketingProjectSummary>((row) => {
    const summary = summaries.get(row.dashboard_id);
    if (!summary) return [];
    return [{
      ...normalizeProject(row),
      startDate: String(summary.start_date),
      totalBudget: Number(summary.total_budget),
      metricCount: Number(summary.metric_count ?? 0),
      spend: Number(summary.spend ?? 0),
      paidLandingLeads: Number(summary.paid_landing_leads ?? 0),
      organicLandingLeads: Number(summary.organic_landing_leads ?? 0),
    }];
  });
  return sortExternalMarketingProjects(projects);
}

export async function loadExternalMarketingProject(workspaceId: string, dashboardId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("external_marketing_projects")
    .select(projectColumns)
    .eq("workspace_id", workspaceId)
    .eq("dashboard_id", dashboardId)
    .maybeSingle();
  if (error) throw new Error(`외부마케팅대행 조회 실패: ${error.code}`);
  if (!data) return null;
  const dashboard = await loadAdPerformanceDashboard(workspaceId, dashboardId, "external_marketing");
  return dashboard ? { project: normalizeProject(data as ProjectRow), dashboard } : null;
}

async function loadProjectByToken(token: string) {
  if (!externalMarketingTokenSchema.safeParse(token).success) return null;
  const { data, error } = await createAdminClient()
    .from("external_marketing_projects")
    .select(projectColumns)
    .eq("public_token", token)
    .eq("public_enabled", true)
    .maybeSingle();
  if (error) throw new Error(`외부마케팅대행 공개 조회 실패: ${error.code}`);
  return data ? normalizeProject(data as ProjectRow) : null;
}

export async function loadPublicExternalMarketingReport(token: string): Promise<{
  project: ExternalMarketingProject;
  dashboard: AdPerformanceDashboardData;
} | null> {
  const project = await loadProjectByToken(token);
  if (!project) return null;
  const dashboard = await loadAdPerformanceDashboard(project.workspaceId, project.dashboardId, "external_marketing");
  return dashboard ? { project, dashboard } : null;
}
