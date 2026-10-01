import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CourseWebinarEditor } from "@/components/course-operations/course-webinar-editor";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CourseWebinarDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const membership = await requireCourseOperationsMembership(user.id);
  const { data: course, error } = await createAdminClient()
    .from("courses")
    .select("id,name")
    .eq("workspace_id", membership.workspace_id)
    .eq("id", courseId)
    .maybeSingle();

  if (error) throw new Error(`강의 조회 실패: ${error.code}`);
  if (!course) notFound();

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <BackLink href="/services/course-webinars">
              <ArrowLeft />뒤로가기
            </BackLink>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <h1 className="truncate font-semibold">{course.name} 라이브 웨비나</h1>
        </div>
      </header>
      <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
        <CourseWebinarEditor courseId={courseId} />
      </div>
    </main>
  );
}
