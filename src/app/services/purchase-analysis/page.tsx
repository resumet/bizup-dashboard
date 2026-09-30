import Link from "next/link";
import { BackLink } from "@/components/layout/back-link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PurchaseAnalysisDashboard } from "@/components/purchases/purchase-analysis-dashboard";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PurchaseAnalysisPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <BackLink href="/"><ArrowLeft /> 뒤로가기</BackLink>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">주문결제 매출분석</span>
          <Button variant="outline" size="sm" className="ml-auto" asChild>
            <Link href="/services/settlement-analysis">기존 정산 서비스 <ExternalLink /></Link>
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-[1900px] px-5 py-10 lg:px-8">
        <h1 className="mb-8 text-3xl font-semibold tracking-tight">주문결제 매출분석</h1>
        <PurchaseAnalysisDashboard />
      </div>
    </main>
  );
}
