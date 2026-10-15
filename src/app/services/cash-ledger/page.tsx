import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { LedgerWorkspace } from "@/components/cash-ledger/ledger-workspace";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CashLedgerPage() {
  if (!await getAuthenticatedUser(await createClient())) redirect("/login");
  return <main className="min-h-screen"><header className="border-b"><div className="mx-auto flex h-16 max-w-[1900px] items-center px-5 lg:px-8"><Button variant="ghost" size="sm" asChild><BackLink href="/"><ArrowLeft />메인으로</BackLink></Button></div></header><div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8"><LedgerWorkspace /></div></main>;
}
