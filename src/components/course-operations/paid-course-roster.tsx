import { CourseRosterDetail } from "@/components/jobs/course-roster-detail";
import { createClient } from "@/lib/supabase/server";
import { InitializePaidRoster } from "./initialize-paid-roster";

export async function PaidCourseRoster({ courseId }: { courseId: string }) {
  const supabase = await createClient();
  const { data: job, error } = await supabase.from("course_jobs").select("id")
    .eq("course_id", courseId).eq("is_order_roster", true).maybeSingle();
  if (error) return <p role="alert" className="text-destructive">유료수강생 명단을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</p>;
  if (!job) return <InitializePaidRoster courseId={courseId} />;
  return <CourseRosterDetail jobId={job.id} embedded />;
}
