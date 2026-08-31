import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CourseSettlementManager } from "@/components/course-settlements/course-settlement-manager";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SettlementAnalysisPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto max-w-[1600px] px-5 lg:px-8">
          <div className="flex h-16 items-center">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ArrowLeft />
                서비스 홈
              </Link>
            </Button>
            <div className="mx-3 h-5 w-px bg-border" />
            <span className="font-semibold">강의별 정산</span>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <CourseSettlementManager
          courseId="settlement-analysis"
          courseName="비즈업클래스"
          instructorName="전체 강사"
        />
      </div>
    </main>
  );
}
