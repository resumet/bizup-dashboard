import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { MessageStudioProjectManager } from "@/components/message-studio/project-manager";
import { Button } from "@/components/ui/button";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MessageStudioPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const [projectsResult, coursesResult] = await Promise.all([
    supabase
      .from("message_studio_projects")
      .select(
        "id,course_name,instructor_name,updated_at,message_studio_resources(generated_text)",
      )
      .order("updated_at", { ascending: false }),
    supabase
      .from("courses")
      .select(
        "id,name,instructor_name,payment_link,inquiry_link,curriculum_link,free_gift_link",
      )
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <main className="min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft />
              서비스
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="font-semibold">문자 생성·제작 프로그램</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
        <MessageStudioProjectManager
          projects={(projectsResult.data ?? []) as never[]}
          courses={(coursesResult.data ?? []) as never[]}
          loadError={
            projectsResult.error?.message || coursesResult.error?.message
          }
        />
      </div>
    </main>
  );
}
