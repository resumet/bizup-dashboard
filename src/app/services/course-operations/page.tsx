import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Plus,
} from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { CourseOperationsList } from "@/components/course-operations/course-list";
import { hasAdminAccess } from "@/lib/admin/access";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getCachedCourseSummaries } from "@/lib/course-operations/list-cache";
import { toKoreaDate } from "@/lib/course-operations/schedule";
import type { CourseSummary } from "@/lib/course-operations/types";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CourseOperationsPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const membership = await requireCourseOperationsMembership(user.id);
  const todayKoreaDate = toKoreaDate(new Date().toISOString());

  let courses: CourseSummary[] = [];
  let loadError = "";
  try {
    courses = await getCachedCourseSummaries(
      membership.workspace_id,
      todayKoreaDate,
    );
  } catch (caught) {
    loadError =
      caught instanceof Error
        ? caught.message
        : "강의 목록을 불러오지 못했습니다.";
  }

  return (
    <main className="min-h-screen bg-muted/[0.12]">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <BackLink href="/work">
              <ArrowLeft />뒤로가기
            </BackLink>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold tracking-tight">진행중 강의 보기</span>
        </div>
      </header>

      <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8">
        {loadError ? (
          <Alert variant="destructive">
            <AlertTitle>강의 목록을 불러오지 못했습니다</AlertTitle>
            <AlertDescription>
              {/PGRST205|42P01/u.test(loadError)
                ? "강의 운영 DB 마이그레이션을 먼저 적용해 주세요."
                : loadError}
            </AlertDescription>
          </Alert>
        ) : null}

        {!loadError && courses.length === 0 ? (
          <section className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed bg-background px-6 text-center">
              <h2 className="font-semibold">아직 등록된 강의가 없습니다</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                새 강의를 만들면 이곳에서 일정과 운영 상태를 관리할 수 있습니다.
              </p>
              <Button asChild className="mt-5">
                <Link href="/services/course-operations/new">
                  <Plus />새 강의 만들기
                </Link>
              </Button>
          </section>
        ) : null}

        {!loadError && courses.length > 0 ? (
          <div>
            <CourseOperationsList
              courses={courses}
              canDelete={hasAdminAccess(user.email, membership.role)}
              todayKoreaDate={todayKoreaDate}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
