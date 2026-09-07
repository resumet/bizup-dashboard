import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { NovaSettlementValidator } from "@/components/tools/nova-settlement-validator";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "노바 정산서 검증하기" };

export default async function NovaSettlementValidatorPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild><Link href="/"><ArrowLeft /> 서비스</Link></Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">노바 정산서 검증하기</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8"><NovaSettlementValidator /></div>
    </main>
  );
}
