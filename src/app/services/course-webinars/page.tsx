import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { WebinarDashboard } from "@/components/course-operations/webinar-dashboard";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CourseWebinarsPage() {
  if (!await getAuthenticatedUser(await createClient())) redirect("/login");

  return <main className="min-h-screen">
    <header className="border-b bg-background">
      <div className="mx-auto flex h-18 max-w-[1900px] items-center gap-3 px-5 lg:px-8">
        <Button variant="ghost" size="sm" asChild><BackLink href="/work"><ArrowLeft />뒤로가기</BackLink></Button>
        <div className="h-5 w-px bg-border" />
        <h1 className="min-w-0 text-base font-semibold">라이브 웨비나 대시보드</h1>
      </div>
    </header>
    <div className="mx-auto max-w-[1900px] px-5 pb-10 lg:px-8"><WebinarDashboard /></div>
  </main>;
}
