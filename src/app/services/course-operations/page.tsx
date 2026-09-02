import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BookOpenCheck,
  Plus,
} from "lucide-react";

import { CourseOperationsList } from "@/components/course-operations/course-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CourseSummary } from "@/lib/course-operations/types";
import { normalizeRequiredTasks } from "@/lib/course-operations/required-tasks";
import { toKoreaDate } from "@/lib/course-operations/schedule";
import { applyTaskDeadlines } from "@/lib/course-operations/task-deadlines";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CourseOperationsPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  await requireCourseOperationsMembership(user.id);

  const { data, error } = await supabase
    .from("courses")
    .select(
      "id,name,instructor_name,free_webinar_at,starts_at,updated_at,required_tasks,course_options(id),course_jobs(id),message_studio_projects(id)",
    )
    .order("updated_at", { ascending: false });
  const courses = (data ?? []).map((course) => ({
    ...course,
    required_tasks: applyTaskDeadlines(
      normalizeRequiredTasks(course.required_tasks),
      toKoreaDate(course.free_webinar_at),
    ),
  })) as CourseSummary[];

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft />서비스
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">강의 운영 자동화</span>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <Badge variant="outline" className="mb-3">강의 중심 관리</Badge>
            <h1 className="text-3xl font-semibold tracking-tight">강의 목록</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              강의 ID를 기준으로 일정, 옵션, 수강생 명단과 문자 제작물을 한곳에서
              관리합니다.
            </p>
          </div>
          <Button asChild className="min-h-10">
            <Link href="/services/course-operations/new">
              <Plus />새 강의 만들기
            </Link>
          </Button>
        </div>

        {error ? (
          <Alert variant="destructive" className="mt-6">
            <AlertTitle>강의 목록을 불러오지 못했습니다</AlertTitle>
            <AlertDescription>
              {error.code === "PGRST205"
                ? "강의 운영 DB 마이그레이션을 먼저 적용해 주세요."
                : error.message}
            </AlertDescription>
          </Alert>
        ) : null}

        {!error && courses.length === 0 ? (
          <Card className="mt-6">
            <CardContent className="flex min-h-72 flex-col items-center justify-center text-center">
              <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                <BookOpenCheck className="size-5" />
              </span>
              <h2 className="font-semibold">아직 등록된 강의가 없습니다</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                첫 강의를 만들고 기존 수강생 명단과 문자 제작물을 연결해 보세요.
              </p>
              <Button asChild className="mt-5">
                <Link href="/services/course-operations/new">
                  <Plus />새 강의 만들기
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!error && courses.length > 0 ? (
          <div className="mt-6">
            <CourseOperationsList courses={courses} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
