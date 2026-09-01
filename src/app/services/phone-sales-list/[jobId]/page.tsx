import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PhoneSalesListMaker } from "@/components/tools/phone-sales-list-maker";
import { Button } from "@/components/ui/button";
import {
  normalizePhoneSalesContacts,
  type PhoneSalesJobDetail,
} from "@/lib/phone-sales/jobs";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ jobId: string }>;
};

export default async function PhoneSalesJobDetailPage({ params }: PageProps) {
  const { jobId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("phone_sales_jobs")
    .select(
      "id,instructor_name,free_filenames,paid_filenames,free_count,paid_count,excluded_count,result_count,contacts,created_at,updated_at",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) notFound();

  const job = {
    ...data,
    contacts: normalizePhoneSalesContacts(data.contacts),
  } as PhoneSalesJobDetail;

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/services/phone-sales-list">
              <ArrowLeft /> 작업 목록
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">{job.instructor_name}</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <PhoneSalesListMaker initialJob={job} />
      </div>
    </main>
  );
}
