import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CourseWbsWorkspace } from "@/components/course-wbs/course-wbs-workspace";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { isSuperAdminEmail } from "@/lib/admin/access";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CourseWbsPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>;
}) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  const { courseId } = await searchParams;

  return (
    <main className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center gap-3 px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild><BackLink href="/work"><ArrowLeft /> 뒤로가기</BackLink></Button>
        </div>
      </header>
      <CourseWbsWorkspace initialCourseId={courseId ?? ""} canSaveTemplate={isSuperAdminEmail(user.email)} />
    </main>
  );
}
