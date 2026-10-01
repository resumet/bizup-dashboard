import { redirect } from "next/navigation";

import { CourseWbsWorkspace } from "@/components/course-wbs/course-wbs-workspace";
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
      <CourseWbsWorkspace initialCourseId={courseId ?? ""} canSaveTemplate={isSuperAdminEmail(user.email)} />
    </main>
  );
}
