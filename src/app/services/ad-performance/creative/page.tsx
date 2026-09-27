import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3, ImageIcon } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireCourseOperationsMembership } from "@/lib/course-operations/server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdCreativePerformancePage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  await requireCourseOperationsMembership(user.id);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
        <Button variant="ghost" size="sm" asChild className="mb-5"><BackLink href="/services/ad-performance"><ArrowLeft />뒤로가기</BackLink></Button>
        <Badge variant="outline" className="mb-3"><BarChart3 />강의별 광고 운영</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">소재성과 관리</h1>
        <p className="mt-2 text-muted-foreground">광고 소재별 성과를 관리합니다.</p>

        <Card className="mt-8">
          <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
            <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><ImageIcon className="size-5" /></span>
            <h2 className="text-lg font-semibold">소재성과 관리는 준비 중입니다</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">광고 소재별 성과를 확인하는 화면을 준비하고 있습니다.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
