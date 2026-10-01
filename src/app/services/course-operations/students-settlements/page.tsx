import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { StudentSettlementOverview } from "@/components/course-operations/student-settlement-overview";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { loadStudentSettlementCourseSummaries } from "@/lib/course-operations/student-settlement-summary-server";
import type { StudentSettlementCourseSummary } from "@/lib/course-operations/student-settlement-summary";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function StudentSettlementsPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);

  let courses: StudentSettlementCourseSummary[] = [];
  let loadError = "";
  try {
    courses = await loadStudentSettlementCourseSummaries(
      membership.workspace_id,
    );
  } catch (error) {
    loadError =
      error instanceof Error
        ? error.message
        : "수강생관리 및 정산 목록을 불러오지 못했습니다.";
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <BackLink href="/work">
              <ArrowLeft />뒤로가기
            </BackLink>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">수강생관리 및 정산</span>
        </div>
      </header>

      <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          수강생관리 및 정산
        </h1>

        {loadError ? (
          <Alert variant="destructive" className="mt-6">
            <AlertTitle>목록을 불러오지 못했습니다</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : (
          <div className="mt-6">
            <StudentSettlementOverview courses={courses} />
          </div>
        )}
      </div>
    </main>
  );
}
