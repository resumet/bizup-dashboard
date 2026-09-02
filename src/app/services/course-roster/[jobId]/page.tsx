import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { RosterDetailClient } from "@/components/jobs/roster-detail-client";
import { Button } from "@/components/ui/button";
import { loadJobEnrollmentRows } from "@/lib/jobs/server";
import { toCourseJobNote, type CourseJobNote } from "@/lib/jobs/notes";
import type { LinkedCourseOptionInvite } from "@/lib/jobs/types";
import type { MessageHistoryItem } from "@/lib/messages/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type PageProps = { params: Promise<{ jobId: string }> };

export default async function CourseRosterDetailPage({ params }: PageProps) {
  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("course_jobs")
    .select("id,name,default_course_name,status,latest_version,valid_count,error_count,updated_at,course_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) notFound();

  const [enrollmentResult, messageResult, testResult, courseOptionsResult, linkedCourseResult, notesResult] = await Promise.all([
    loadJobEnrollmentRows(supabase, jobId, job.latest_version)
      .then((data) => ({ data, error: null }))
      .catch((error: Error) => ({ data: [], error })),
    supabase.from("message_jobs").select("id,template_key,target_scope,requested_count,success_count,failed_count,status,provider,delivery_checked_at,created_at").eq("course_job_id", jobId).order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("id,metadata,created_at").eq("entity_id", jobId).eq("event_type", "course_job.test_message_sent").order("created_at", { ascending: false }),
    job.course_id
      ? supabase
          .from("course_options")
          .select("*")
          .eq("course_id", job.course_id)
          .order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    job.course_id
      ? supabase
          .from("courses")
          .select("name")
          .eq("id", job.course_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("course_job_notes")
      .select("id,content,created_by,author_email,created_at,updated_at")
      .eq("course_job_id", jobId)
      .order("created_at", { ascending: false }),
  ]);
  const rows = enrollmentResult.data;
  const courseName =
    linkedCourseResult.data?.name?.trim() ||
    job.default_course_name?.trim() ||
    rows.find((row) => row.values.courseName)?.values.courseName ||
    "";
  const messageHistory: MessageHistoryItem[] = [
    ...(messageResult.data ?? []).map((message): MessageHistoryItem => ({
      id: message.id,
      detailId: message.id,
      isTest: false,
      templateKey: message.template_key as MessageHistoryItem["templateKey"],
      targetScope: message.target_scope,
      requestedCount: message.requested_count,
      successCount: message.success_count,
      failedCount: message.failed_count,
      status: message.status,
      provider: message.provider,
      deliveryCheckedAt: message.delivery_checked_at,
      createdAt: message.created_at,
    })),
    ...(testResult.data ?? []).flatMap((audit): MessageHistoryItem[] => {
      const metadata = audit.metadata as Record<string, unknown>;
      const template = metadata.template;
      if (template !== "paid_confirm" && template !== "paid_invite") return [];
      const success = metadata.success === true;
      return [{ id: `test-${audit.id}`, detailId: `test-${audit.id}`, isTest: true, templateKey: template, targetScope: "test", requestedCount: 1, successCount: success ? 1 : 0, failedCount: success ? 0 : 1, status: success ? "completed" : "failed", createdAt: audit.created_at }];
    }),
  ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const historyError = messageResult.error?.message ?? testResult.error?.message;
  const notes: CourseJobNote[] = (notesResult.data ?? []).map(toCourseJobNote);
  const notesError = notesResult.error
    ? notesResult.error.code === "PGRST205" || notesResult.error.code === "42P01"
      ? "명단 메모 DB 마이그레이션을 먼저 적용해 주세요."
      : notesResult.error.message
    : undefined;
  const linkedCourseOptionInvites: LinkedCourseOptionInvite[] = (
    courseOptionsResult.data ?? []
  ).map((option) => ({
    optionName: option.name,
    entryCode: option.entry_code ?? "",
    linkName: option.group_chat_link ?? "",
  }));

  return <main className="min-h-screen">
    <header className="border-b bg-background">
      <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
        <Button variant="ghost" size="sm" asChild><Link href="/services/course-roster"><ArrowLeft />작업 목록</Link></Button>
        <div className="mx-3 h-5 w-px bg-border" />
        <span className="truncate font-semibold">{job.name}</span>
      </div>
    </header>
    <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
      <RosterDetailClient key={job.latest_version} jobId={job.id} jobName={job.name} jobVersion={job.latest_version} jobStatus={job.status} defaultCourseName={courseName} rows={rows} messageHistory={messageHistory} linkedCourseOptionInvites={linkedCourseOptionInvites} hasLinkedCourse={Boolean(job.course_id)} currentUserId={user.id} currentUserEmail={user.email ?? "이메일 정보 없음"} notes={notes} notesError={notesError} loadError={enrollmentResult.error?.message ?? courseOptionsResult.error?.message ?? linkedCourseResult.error?.message} historyError={historyError} />
    </div>
  </main>;
}
