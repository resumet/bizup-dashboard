import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { TossPaymentLab } from "@/components/admin/toss-payment-lab";
import { Button } from "@/components/ui/button";
import { isSuperAdminEmail } from "@/lib/admin/access";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TossPaymentLabPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  if (!isSuperAdminEmail(user.email)) notFound();

  return (
    <main className="min-h-dvh bg-slate-50/70">
      <div className="mx-auto max-w-[1400px] space-y-6 px-5 py-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="icon" aria-label="실험실로 돌아가기"><Link href="/admin/labs"><ArrowLeft /></Link></Button>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">토스 결제 실험</h1>
        </div>
        <TossPaymentLab />
      </div>
    </main>
  );
}
