import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, CreditCard } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { isSuperAdminEmail } from "@/lib/admin/access";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLabsPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  if (!isSuperAdminEmail(user.email)) notFound();

  return (
    <main className="min-h-dvh bg-slate-50/70">
      <div className="mx-auto max-w-[1600px] space-y-6 px-5 py-8 lg:px-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">실험실</h1>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Link href="/admin/labs/toss-payment" className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
            <Card className="h-full border-slate-200 bg-white transition-colors group-hover:border-blue-300 group-hover:bg-blue-50/30">
              <CardContent className="flex min-h-40 items-center gap-4 p-6">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                  <CreditCard className="size-6" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 text-lg font-semibold text-slate-950">토스 결제 실험</span>
                <ArrowUpRight className="size-5 shrink-0 text-slate-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-blue-700" aria-hidden="true" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </main>
  );
}
