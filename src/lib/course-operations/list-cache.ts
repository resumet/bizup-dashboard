import { sortByNearestWebinar } from "@/lib/course-operations/webinar-proximity";
import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { toKoreaDate } from "./schedule";
import { normalizeRequiredTasks } from "./required-tasks";
import type { CourseSummary } from "./types";

export const COURSE_OPERATIONS_LIST_CACHE_TAG = "course-operations-list";
export const COURSE_OPERATIONS_LIST_REVALIDATE_SECONDS = 300;

type WbsProgressRow = {
  course_id: string;
  total_item_count: number | string;
  overdue_item_count: number | string;
};

const loadCachedCourseSummaries = unstable_cache(
  async (workspaceId: string, todayKoreaDate: string) => {
    const admin = createAdminClient();
    const [coursesResult, wbsProgressResult] = await Promise.all([
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

    const progressByCourse = new Map<string, { total: number; overdue: number }>(
      ((wbsProgressResult.data ?? []) as WbsProgressRow[]).map((progress) => [
        progress.course_id,
        {
          total: Number(progress.total_item_count) || 0,
          overdue: Number(progress.overdue_item_count) || 0,
        },
      ]),
    );

    return (coursesResult.data ?? []).map((course) => ({
      ...course,
      course_options: Array.from({ length: course.course_options?.[0]?.count ?? 0 }, (_, index) => ({ id: String(index) })),
      course_jobs: Array.from({ length: course.course_jobs?.[0]?.count ?? 0 }, (_, index) => ({ id: String(index) })),
      message_studio_projects: Array.from({ length: course.message_studio_projects?.[0]?.count ?? 0 }, (_, index) => ({ id: String(index) })),
      required_tasks: normalizeRequiredTasks(course.required_tasks),
      wbs_total_item_count: progressByCourse.get(course.id)?.total ?? 0,
      wbs_overdue_item_count: progressByCourse.get(course.id)?.overdue ?? 0,
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
