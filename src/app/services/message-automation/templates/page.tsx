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

  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const previews = membership
    ? await supabase
        .from("message_template_previews")
        .select("template_id,body")
        .eq("workspace_id", membership.workspace_id)
    : { data: null, error: membershipError ?? { message: "워크스페이스 권한을 확인해 주세요." } };
  const previewBodies = new Map(
    (previews.data ?? []).map((preview) => [preview.template_id, preview.body]),
  );

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
          templates={(data ?? []).map((template) => ({
            ...template,
            preview_body: previewBodies.get(template.id) ?? "",
          }))}
          loadError={error?.message}
          previewLoadError={previews.error ? "미리보기 본문을 불러오지 못했습니다. 본문 설정에서 다시 확인해 주세요." : undefined}
        />
      </div>
    </main>
  );
}
