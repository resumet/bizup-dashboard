import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PhoneSalesJobList } from "@/components/tools/phone-sales-list-maker";
import { Button } from "@/components/ui/button";
import type { PhoneSalesJobSummary } from "@/lib/phone-sales/jobs";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

function tableErrorMessage(error: { code?: string; message: string } | null) {
  if (!error) return undefined;
  if (error.code === "PGRST205" || error.code === "42P01") {
    return "전화세일즈 작업 DB 마이그레이션을 먼저 적용해 주세요.";
  }
  return error.message;
}

export default async function PhoneSalesListPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("phone_sales_jobs")
    .select(
      "id,instructor_name,free_filenames,paid_filenames,free_count,paid_count,excluded_count,result_count,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft /> 서비스
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">전화세일즈 명단 만들기</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <PhoneSalesJobList
          jobs={(data ?? []) as PhoneSalesJobSummary[]}
          loadError={tableErrorMessage(error)}
        />
      </div>
    </main>
  );
}
