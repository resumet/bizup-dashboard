import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { toKoreaDate } from "./schedule";
import { normalizeRequiredTasks } from "./required-tasks";
import { summarizeCourseAdLeadCosts } from "./ad-performance-costs";
import type { CourseSummary } from "./types";

export const COURSE_OPERATIONS_LIST_CACHE_TAG = "course-operations-list";
export const COURSE_OPERATIONS_LIST_REVALIDATE_SECONDS = 300;

type WbsProgressRow = {
  course_id: string;
  total_item_count: number | string;
  overdue_item_count: number | string;
};

type AdPerformanceDashboardRow = {
  course_id: string | null;
  ad_performance_dashboard_metrics: Array<{
    google_spend: number | string;
    meta_spend: number | string;
    google_ad_leads: number | string;
    meta_ad_leads: number | string;
  }> | null;
};

const loadCachedCourseSummaries = unstable_cache(
  async (workspaceId: string, todayKoreaDate: string) => {
    const admin = createAdminClient();
    const [coursesResult, wbsProgressResult, adPerformanceResult] = await Promise.all([
      admin
        .from("courses")
        .select(
          "id,status,name,instructor_name,banner_image_path,free_webinar_at,starts_at,updated_at,cohort,nova_settled,instructor_settled,landing_page_link,free_kakao_room_1_link,free_kakao_room_2_link,paid_kakao_room_link,payment_link,curriculum_link,course_materials_link,required_tasks,course_options(count),course_jobs(count),message_studio_projects(count)",
        )
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false }),
      admin.rpc("course_operations_list_wbs_progress", {
        p_workspace_id: workspaceId,
        p_today: todayKoreaDate,
      }),
      admin
        .from("ad_performance_dashboards")
        .select("course_id,ad_performance_dashboard_metrics(google_spend,meta_spend,google_ad_leads,meta_ad_leads)")
        .eq("workspace_id", workspaceId)
        .eq("service_scope", "bizup"),
    ]);
    if (coursesResult.error) {
      throw new Error(
        `강의 목록 조회 실패 (${coursesResult.error.code}): ${coursesResult.error.message}`,
      );
    }
    if (wbsProgressResult.error) {
      throw new Error(
        `강의 WBS 진행 현황 조회 실패 (${wbsProgressResult.error.code}): ${wbsProgressResult.error.message}`,
      );
    }
    if (adPerformanceResult.error) {
      throw new Error(
        `강의 광고성과 조회 실패 (${adPerformanceResult.error.code}): ${adPerformanceResult.error.message}`,
      );
    }

    const progressByCourse = new Map<string, { total: number; overdue: number }>(
      ((wbsProgressResult.data ?? []) as WbsProgressRow[]).map((progress) => [
        progress.course_id,
        {
          total: Number(progress.total_item_count) || 0,
          overdue: Number(progress.overdue_item_count) || 0,
        },
      ]),
    );
    const adLeadCostsByCourse = summarizeCourseAdLeadCosts(
      ((adPerformanceResult.data ?? []) as AdPerformanceDashboardRow[]).flatMap(
        (dashboard) => (dashboard.ad_performance_dashboard_metrics ?? []).map(
          (metric) => ({
            courseId: dashboard.course_id,
            googleSpend: metric.google_spend,
            metaSpend: metric.meta_spend,
            googleAdLeads: metric.google_ad_leads,
            metaAdLeads: metric.meta_ad_leads,
          }),
        ),
      ),
    );

    return (coursesResult.data ?? []).map((course) => ({
      ...course,
      course_options: Array.from({ length: course.course_options?.[0]?.count ?? 0 }, (_, index) => ({ id: String(index) })),
      course_jobs: Array.from({ length: course.course_jobs?.[0]?.count ?? 0 }, (_, index) => ({ id: String(index) })),
      message_studio_projects: Array.from({ length: course.message_studio_projects?.[0]?.count ?? 0 }, (_, index) => ({ id: String(index) })),
      required_tasks: normalizeRequiredTasks(course.required_tasks),
      wbs_total_item_count: progressByCourse.get(course.id)?.total ?? 0,
      wbs_overdue_item_count: progressByCourse.get(course.id)?.overdue ?? 0,
      google_ad_lead_cost: adLeadCostsByCourse.get(course.id)?.googleAdLeadCost ?? null,
      meta_ad_lead_cost: adLeadCostsByCourse.get(course.id)?.metaAdLeadCost ?? null,
    })) as CourseSummary[];
  },
  [COURSE_OPERATIONS_LIST_CACHE_TAG],
  {
    tags: [COURSE_OPERATIONS_LIST_CACHE_TAG],
    revalidate: COURSE_OPERATIONS_LIST_REVALIDATE_SECONDS,
  },
);

export async function getCachedCourseSummaries(
  workspaceId: string,
  todayKoreaDate = toKoreaDate(new Date().toISOString()),
) {
  return sortByNearestWebinar(
    await loadCachedCourseSummaries(workspaceId, todayKoreaDate),
    todayKoreaDate,
  );
}

export function invalidateCourseOperationsList() {
  revalidateTag(COURSE_OPERATIONS_LIST_CACHE_TAG, { expire: 0 });
}
