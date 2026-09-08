import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRequiredTasks } from "./required-tasks";
import { toKoreaDate } from "./schedule";
import { applyTaskDeadlines } from "./task-deadlines";
import type { CourseSummary } from "./types";

export const COURSE_OPERATIONS_LIST_CACHE_TAG = "course-operations-list";
export const COURSE_OPERATIONS_LIST_REVALIDATE_SECONDS = 300;

const loadCachedCourseSummaries = unstable_cache(
  async (workspaceId: string) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("courses")
      .select(
        "id,name,instructor_name,banner_image_path,free_webinar_at,starts_at,updated_at,required_tasks,course_options(id),course_jobs(id),message_studio_projects(id)",
      )
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false });
    if (error) {
      throw new Error(`강의 목록 조회 실패 (${error.code}): ${error.message}`);
    }

    return (data ?? []).map((course) => ({
      ...course,
      required_tasks: applyTaskDeadlines(
        normalizeRequiredTasks(course.required_tasks),
        toKoreaDate(course.free_webinar_at),
      ),
    })) as CourseSummary[];
  },
  [COURSE_OPERATIONS_LIST_CACHE_TAG],
  {
    tags: [COURSE_OPERATIONS_LIST_CACHE_TAG],
    revalidate: COURSE_OPERATIONS_LIST_REVALIDATE_SECONDS,
  },
);

export function getCachedCourseSummaries(workspaceId: string) {
  return loadCachedCourseSummaries(workspaceId);
}

export function invalidateCourseOperationsList() {
  revalidateTag(COURSE_OPERATIONS_LIST_CACHE_TAG, { expire: 0 });
}
