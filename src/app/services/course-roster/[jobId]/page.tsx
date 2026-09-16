import { CourseRosterDetail } from "@/components/jobs/course-roster-detail";

export default async function CourseRosterDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <CourseRosterDetail jobId={jobId} />;
}
