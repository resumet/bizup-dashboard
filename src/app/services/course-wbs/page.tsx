import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChartGantt } from "lucide-react";

import { CourseWbsWorkspace } from "@/components/course-wbs/course-wbs-workspace";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CourseWbsPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>;
}) {
  if (!await getAuthenticatedUser(await createClient())) redirect("/login");
  const { courseId } = await searchParams;

  return (
    <main className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center gap-3 px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild><Link href="/work"><ArrowLeft /> 강의관리</Link></Button>
          <div className="h-5 w-px bg-border" />
          <ChartGantt className="size-5 text-primary" aria-hidden="true" />
          <h1 className="min-w-0 text-base font-semibold">강의 WBS</h1>
        </div>
      </header>
      <CourseWbsWorkspace initialCourseId={courseId ?? ""} />
    </main>
  );
}
