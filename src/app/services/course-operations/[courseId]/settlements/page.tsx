import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { CourseSettlementManager } from "@/components/course-settlements/course-settlement-manager";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ courseId: string }> };
export default async function CourseSettlementPage({ params }: Props) {
  const { courseId } = await params; const supabase = await createClient(); const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const { data: course } = await supabase.from("courses").select("id,name,instructor_name").eq("id", courseId).maybeSingle();
  if (!course) notFound();
  return <main className="min-h-screen"><header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8"><Button variant="ghost" size="sm" asChild><Link href={`/services/course-operations/${courseId}`}><ArrowLeft/>강의 상세</Link></Button><div className="mx-3 h-5 w-px bg-border"/><span className="truncate font-semibold">강의별 정산</span></div></header><div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8"><CourseSettlementManager courseId={courseId} courseName={course.name} instructorName={course.instructor_name}/></div></main>;
}
