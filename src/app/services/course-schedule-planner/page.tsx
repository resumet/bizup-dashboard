import { redirect } from "next/navigation";

import { CourseSchedulePlanner } from "@/components/course-schedule-planner/course-schedule-planner";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { loadCourseSchedulePlanner } from "@/lib/course-schedule-planner/server";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CourseSchedulePlannerPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const data = await loadCourseSchedulePlanner(membership.workspace_id);
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="icon" asChild>
            <BackLink href="/work" aria-label="운영 워크스페이스로 돌아가기">
              뒤로가기
            </BackLink>
          </Button>
        </div>
      </header>
      <CourseSchedulePlanner initialData={data} />
    </div>
  );
}
