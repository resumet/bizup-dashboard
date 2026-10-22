import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
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
  cohort: string;
  landing_pages: unknown;
  creative_drive_url: string;
  intake_token: string;
  public_token: string;
  intake_enabled: boolean;
  public_enabled: boolean;
  updated_at: string;
};

function normalizeProject(row: ProjectRow): ExternalMarketingProject {
  const info = externalMarketingInfoSchema.parse({
    courseName: row.course_name,
    instructorName: row.instructor_name,
    cohort: row.cohort,
    landingPages: row.landing_pages,
    creativeDriveUrl: row.creative_drive_url,
  });
  return {
    ...info,
    dashboardId: row.dashboard_id,
    workspaceId: row.workspace_id,
    intakeToken: row.intake_token,
    publicToken: row.public_token,
    intakeEnabled: row.intake_enabled,
    publicEnabled: row.public_enabled,
    updatedAt: row.updated_at,
  };
}

const projectColumns = "dashboard_id,workspace_id,course_name,instructor_name,cohort,landing_pages,creative_drive_url,intake_token,public_token,intake_enabled,public_enabled,updated_at";

export async function loadExternalMarketingProjects(workspaceId: string) {
  const admin = createAdminClient();
  const [projectsResult, summariesResult] = await Promise.all([
    admin.from("external_marketing_projects").select(projectColumns).eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
    admin.from("ad_performance_dashboard_summaries").select("id,start_date,total_budget,metric_count,spend,paid_landing_leads,organic_landing_leads").eq("workspace_id", workspaceId),
  ]);
  if (projectsResult.error) throw new Error(`외부마케팅대행 목록 조회 실패: ${projectsResult.error.code}`);
  if (summariesResult.error) throw new Error(`광고성과 요약 조회 실패: ${summariesResult.error.code}`);
  const summaries = new Map((summariesResult.data ?? []).map((row) => [row.id as string, row]));
  return ((projectsResult.data ?? []) as ProjectRow[]).flatMap<ExternalMarketingProjectSummary>((row) => {
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
  const dashboard = await loadAdPerformanceDashboard(workspaceId, dashboardId);
  return dashboard ? { project: normalizeProject(data as ProjectRow), dashboard } : null;
}

async function loadProjectByToken(token: string, kind: "intake" | "public") {
  if (!externalMarketingTokenSchema.safeParse(token).success) return null;
  const column = kind === "intake" ? "intake_token" : "public_token";
  const enabledColumn = kind === "intake" ? "intake_enabled" : "public_enabled";
  const { data, error } = await createAdminClient()
    .from("external_marketing_projects")
    .select(projectColumns)
    .eq(column, token)
    .eq(enabledColumn, true)
    .maybeSingle();
  if (error) throw new Error(`외부마케팅대행 공개 조회 실패: ${error.code}`);
  return data ? normalizeProject(data as ProjectRow) : null;
}

export function loadExternalMarketingIntake(token: string) {
  return loadProjectByToken(token, "intake");
}

export async function loadPublicExternalMarketingReport(token: string): Promise<{
  project: ExternalMarketingProject;
  dashboard: AdPerformanceDashboardData;
} | null> {
  const project = await loadProjectByToken(token, "public");
  if (!project) return null;
  const dashboard = await loadAdPerformanceDashboard(project.workspaceId, project.dashboardId);
  return dashboard ? { project, dashboard } : null;
}
