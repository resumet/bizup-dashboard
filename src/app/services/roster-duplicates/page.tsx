import { BackLink } from "@/components/layout/back-link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RosterComparison } from "@/components/tools/roster-comparison";
import { Button } from "@/components/ui/button";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function RosterDuplicatesPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  await requireCourseOperationsMembership(user.id);
  return <main className="min-h-screen">
    <header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8"><Button variant="ghost" size="sm" asChild><BackLink href="/"><ArrowLeft /> 뒤로가기</BackLink></Button><div className="mx-3 h-5 w-px bg-border" /><span className="font-semibold">수강생 명단 중복 검사</span></div></header>
    <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8"><RosterComparison mode="duplicates" /></div>
  </main>;
}
