import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { PurchaseAnalysisDashboard } from "@/components/purchases/purchase-analysis-dashboard";
import { Badge } from "@/components/ui/badge";
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
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/"><ArrowLeft /> 서비스</Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">주문결제 매출분석</span>
          <Button variant="outline" size="sm" className="ml-auto" asChild>
            <Link href="/services/settlement-analysis">기존 정산 서비스 <ExternalLink /></Link>
          </Button>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <Badge variant="outline">PURCHASE ANALYTICS</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">주문결제 매출분석</h1>
        <p className="mt-2 mb-8 text-muted-foreground">
          주문결제 원장의 실결제·환불·광고 유입을 분석합니다. 기존 매출정산 서비스와 독립적으로 비교해 사용할 수 있습니다.
        </p>
        <PurchaseAnalysisDashboard />
      </div>
    </main>
  );
}
