import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { cache } from "react";

import { PublicCourseStudentRoster } from "@/components/course-operations/public-course-student-roster";
import { courseRosterShareTitle, verifyCourseRosterShareSignature } from "@/lib/course-orders/public-share";
import { loadCourseOrders } from "@/lib/course-orders/server";
import { createOrderStudentRoster } from "@/lib/course-orders/student-roster";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ courseId: string; signature: string }> };

const loadSharedCourse = cache(async (courseId: string, signature: string) => {
  const secret = process.env.COURSE_INTAKE_SESSION_SECRET?.trim() ?? "";
  if (!verifyCourseRosterShareSignature(courseId, signature, secret)) return null;

  const { data, error } = await createAdminClient()
    .from("courses")
    .select("name,instructor_name")
    .eq("id", courseId)
    .maybeSingle();
  return error ? null : data;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId, signature } = await params;
  const course = await loadSharedCourse(courseId, signature);
  const title = course
    ? courseRosterShareTitle(course.instructor_name ?? "", course.name)
    : "결제명단";
  const description = course
    ? `${course.name} 결제완료 수강생 명단`
    : "공유된 결제완료 수강생 명단";

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function PublicCourseRosterPage({ params }: Props) {
  const { courseId, signature } = await params;
  const course = await loadSharedCourse(courseId, signature);
  if (!course) notFound();

  const admin = createAdminClient();
  const { orders } = await loadCourseOrders(admin, courseId);
  const students = createOrderStudentRoster(orders);

  return (
    <main className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-5 py-7 lg:px-8">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="size-5" /></div>
            <div>
              <p className="text-sm text-muted-foreground">공유된 수강생 명단</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{course.name}</h1>
              {course.instructor_name ? <p className="mt-1 text-sm text-muted-foreground">강사 {course.instructor_name}</p> : null}
            </div>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <PublicCourseStudentRoster courseName={course.name} students={students} />
        <p className="mt-5 text-center text-xs text-muted-foreground">
          링크를 전달받은 사람만 확인할 수 있으며 현재 결제완료 주문을 기준으로 자동 갱신됩니다.
        </p>
      </div>
    </main>
  );
}
