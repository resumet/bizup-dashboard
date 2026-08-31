import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { TemplateManager } from "@/components/address-books/template-manager";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MessageTemplatesPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("message_templates")
    .select(
      "id,name,template_code,send_type,applicant_variable,course_variable,variable_names,is_system,created_at",
    )
    .order("is_system", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/services/message-automation">
              <ArrowLeft />
              알림톡·문자 자동화
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">템플릿 관리</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <TemplateManager
          templates={(data ?? []) as never[]}
          loadError={error?.message}
        />
      </div>
    </main>
  );
}
