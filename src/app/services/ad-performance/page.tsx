import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, BarChart3, ImageIcon } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdPerformancePage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  await requireCourseOperationsMembership(user.id);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" asChild><BackLink href="/work"><ArrowLeft />뒤로가기</BackLink></Button>
          <h1 className="text-3xl font-semibold tracking-tight">광고성과 서비스</h1>
        </div>

        <div className="mt-8 grid max-w-6xl gap-5 md:grid-cols-2">
          <Link href="/services/ad-performance/daily" className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <Card className="h-full min-h-72 transition-colors group-hover:border-primary/50 group-hover:bg-primary/[0.02]">
              <CardHeader>
                <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><BarChart3 className="size-7" aria-hidden="true" /></span>
                <CardTitle className="text-2xl">광고성과 관리</CardTitle>
                <CardDescription className="pt-2 text-sm leading-6">강의별 광고 예산과 일일 성과를 기록하고 확인합니다.</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex items-center gap-2 font-medium text-primary">관리 화면 열기 <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></CardContent>
            </Card>
          </Link>

          <Link href="/services/ad-performance/creative" className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
            <Card className="h-full min-h-72 transition-colors group-hover:border-primary/50 group-hover:bg-primary/[0.02]">
              <CardHeader>
                <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><ImageIcon className="size-7" aria-hidden="true" /></span>
                <div className="flex flex-wrap items-center gap-3"><CardTitle className="text-2xl">소재성과 관리</CardTitle><Badge variant="secondary">준비 중</Badge></div>
                <CardDescription className="pt-2 text-sm leading-6">광고 소재별 성과를 관리할 수 있도록 준비하고 있습니다.</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex items-center gap-2 font-medium text-primary">관리 화면 보기 <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </main>
  );
}
