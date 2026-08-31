import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { DefaultTemplateManager } from "@/components/message-studio/default-template-manager";
import { Button } from "@/components/ui/button";
import { ensureDefaultMessageTemplates } from "@/lib/message-studio/default-template-server";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MessageStudioTemplatesPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");
  const { templates } = await ensureDefaultMessageTemplates(user.id);
  return (
    <main className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/services/message-studio">
              <ArrowLeft />
              문자 제작
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">기본 문자 템플릿 관리</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <DefaultTemplateManager templates={templates} />
      </div>
    </main>
  );
}
