import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PaidCourseRoster } from "@/components/course-operations/paid-course-roster";
import {
  StudentSettlementWorkspace,
  type StudentSettlementTab,
} from "@/components/course-operations/student-settlement-workspace";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Props = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function toManagementTab(tab?: string): StudentSettlementTab {
  if (
    tab === "paid-students" ||
    tab === "costs" ||
    tab === "settlement"
  ) {
    return tab;
  }
  return "orders";
}

export default async function StudentSettlementDetailPage({
  params,
  searchParams,
}: Props) {
  const [{ courseId }, { tab }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  await requireCourseOperationsMembership(user.id);

  const { data: course, error } = await supabase
    .from("courses")
    .select("id,name,instructor_name,cohort,free_webinar_at")
    .eq("id", courseId)
    .maybeSingle();
  if (error) throw new Error(`강의 조회 실패: ${error.code}`);
  if (!course) notFound();

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <BackLink href="/services/course-operations/students-settlements">
              <ArrowLeft />목록으로
            </BackLink>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="truncate font-semibold">
            {course.cohort ? `(${course.cohort}기) ` : ""}
            {course.name}
            {course.instructor_name ? ` - ${course.instructor_name}` : ""}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            {course.name}
          </h1>
        </div>
        <StudentSettlementWorkspace
          courseId={courseId}
          initialCourseName={course.name}
          instructorName={course.instructor_name}
          initialTab={toManagementTab(tab)}
          paidRoster={
            <Suspense
              fallback={
                <p className="py-12 text-center text-sm text-muted-foreground">
                  유료수강생 명단을 불러오는 중입니다.
                </p>
              }
            >
              <PaidCourseRoster courseId={courseId} />
            </Suspense>
          }
        />
      </div>
    </main>
  );
}
