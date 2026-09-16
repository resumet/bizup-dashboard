import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CombinedCourseRosterClient } from "@/components/course-operations/combined-course-roster-client";
import { Button } from "@/components/ui/button";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import type {
  CombinedCourseRosterRow,
  LinkableRosterJob,
} from "@/lib/course-operations/types";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import type { LinkedCourseOptionInvite } from "@/lib/jobs/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function CombinedCourseRosterPage({ params }: PageProps) {
  const { courseId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  await requireCourseOperationsMembership(user.id);

  const [courseResult, jobsResult, optionsResult] = await Promise.all([
    supabase.from("courses").select("id,name").eq("id", courseId).maybeSingle(),
    supabase
      .from("course_jobs")
      .select("id,name,default_course_name,valid_count,course_id,latest_version")
      .eq("is_order_roster", false)
      .eq("course_id", courseId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("course_options")
      .select("name,entry_code,group_chat_link")
      .eq("course_id", courseId)
      .order("sort_order"),
  ]);
  if (!courseResult.data) notFound();
  if (jobsResult.error) {
    throw new Error(`연결된 수강생 명단 조회 실패: ${jobsResult.error.code}`);
  }
  if (optionsResult.error) {
    throw new Error(`강의 옵션 조회 실패: ${optionsResult.error.code}`);
  }

  const rosterJobs = (jobsResult.data ?? []) as LinkableRosterJob[];
  const rowsByJob = await Promise.all(
    rosterJobs.map(async (job) => ({
      job,
      rows: await loadJobEnrollmentRows(supabase, job.id, job.latest_version, true),
    })),
  );
  const rows: CombinedCourseRosterRow[] = rowsByJob.flatMap(({ job, rows }) =>
    rows.map((row) => ({
      ...row,
      sourceJobId: job.id,
      sourceJobName: job.name,
    })),
  );
  const linkedCourseOptionInvites: LinkedCourseOptionInvite[] = (
    optionsResult.data ?? []
  ).map((option) => ({
    optionName: option.name,
    entryCode: option.entry_code ?? "",
    linkName: option.group_chat_link ?? "",
  }));

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/services/course-operations/${courseId}`}>
              <ArrowLeft />강의로 돌아가기
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="truncate font-semibold">
            {courseResult.data.name} 통합 수강생 명단
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        <CombinedCourseRosterClient
          courseId={courseId}
          courseName={courseResult.data.name}
          rows={rows}
          rosterJobs={rosterJobs}
          linkedCourseOptionInvites={linkedCourseOptionInvites}
        />
      </div>
    </main>
  );
}
