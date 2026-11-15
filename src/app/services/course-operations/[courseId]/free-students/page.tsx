import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FreeStudentsManager } from "@/components/course-operations/free-students-manager";
import { Button } from "@/components/ui/button";
import { authorizeFreeStudents, FreeStudentsError, loadFreeStudents } from "@/lib/free-students/server";

export default async function FreeStudentsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const context = await authorizeFreeStudents(courseId).catch(error => {
    if (error instanceof FreeStudentsError && error.status === 401) redirect("/login");
    if (error instanceof FreeStudentsError && [403, 404].includes(error.status)) notFound();
    throw error;
  });
  const snapshot = await loadFreeStudents(context.admin, courseId);
  return <main className="mx-auto max-w-[1900px] space-y-6 px-5 py-8 lg:px-8">
    <Button variant="outline" asChild><Link href={`/services/course-operations/${courseId}`}>강의 상세로</Link></Button>
    <h1 className="text-2xl font-semibold">{context.course.instructor_name ? `${context.course.instructor_name} · ` : ""}{context.course.name} 무료수강생 관리</h1>
    <FreeStudentsManager courseId={courseId} landingPageLink={context.course.landing_page_link ?? ""} initialSnapshot={snapshot} />
  </main>;
}
