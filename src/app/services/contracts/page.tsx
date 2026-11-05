import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

import { InstructorContractWriter } from "@/components/contracts/instructor-contract-writer";
import { BackLink } from "@/components/layout/back-link";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ContractsPage() {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1900px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild><BackLink href="/services/tools"><ArrowLeft />유용한 도구들</BackLink></Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <h1 className="truncate font-semibold">계약서 작성</h1>
        </div>
      </header>
      <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8"><InstructorContractWriter /></div>
    </main>
  );
}
