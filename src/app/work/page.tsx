import { redirect } from "next/navigation";
import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { InstructorCourseSearch } from "@/components/work/instructor-course-search";
import { WorkServiceCards } from "@/components/work/service-cards";
import { WorkServiceCardSettingsButton } from "@/components/work/service-card-settings-button";
import {
  COURSE_STATUS_LABELS,
  isCourseStatus,
} from "@/lib/course-operations/course-status";
import { getCachedCourseSummaries } from "@/lib/course-operations/list-cache";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { formatWebinarDate } from "@/lib/course-operations/webinar-proximity";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdminEmail } from "@/lib/admin/access";
import { DEFAULT_WORK_SERVICE_CARD_SETTINGS } from "@/lib/work/service-card-settings";
import { loadWorkServiceCardSettings } from "@/lib/work/service-card-settings-storage";
import type { InstructorCourseSearchItem } from "@/lib/work/instructor-course-search";

async function loadInstructorCourseSearchItems(userId: string) {
  try {
    const membership = await requireCourseOperationsMembership(userId);
    const courses = await getCachedCourseSummaries(membership.workspace_id);
    const items: InstructorCourseSearchItem[] = courses.map((course) => ({
      id: course.id,
      status: course.status,
      statusLabel: isCourseStatus(course.status)
        ? COURSE_STATUS_LABELS[course.status]
        : course.status,
      name: course.name,
      instructorName: course.instructor_name,
      cohort: course.cohort,
      webinarDate: formatWebinarDate(course.free_webinar_at),
    }));

    return { items, loadError: "" };
  } catch {
    return {
      items: [] as InstructorCourseSearchItem[],
      loadError: "강의 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const currentUser = await getAuthenticatedUser(supabase);

  if (!currentUser) redirect("/login");

  const email = currentUser.email ?? "이메일 정보 없음";
  const [cardSettings, courseSearch] = await Promise.all([
    loadWorkServiceCardSettings().catch(
      () => DEFAULT_WORK_SERVICE_CARD_SETTINGS,
    ),
    loadInstructorCourseSearchItems(currentUser.id),
  ]);

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center gap-6 px-5 lg:px-8">
          <BrandHomeLink />
          <div className="ml-auto flex items-center gap-2">
            {isSuperAdminEmail(email) ? (
              <WorkServiceCardSettingsButton
                hiddenRoutes={cardSettings.hiddenRoutes}
              />
            ) : null}
            <UserAccountMenu email={email} name={currentUser.displayName ?? "사용자"} />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1900px] px-5 py-12 lg:px-8 lg:py-16">
        <InstructorCourseSearch
          courses={courseSearch.items}
          loadError={courseSearch.loadError}
        />
        <WorkServiceCards hiddenRoutes={cardSettings.hiddenRoutes} />
      </div>
    </main>
  );
}
