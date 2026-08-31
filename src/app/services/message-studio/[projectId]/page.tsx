import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { MessageStudioProjectEditor } from "@/components/message-studio/project-editor";
import { Button } from "@/components/ui/button";
import { normalizeGeneratedMessage } from "@/lib/message-studio/link-policy";
import type {
  MessageStudioCourseOption,
  MessageStudioProject,
  MessageStudioResource,
} from "@/lib/message-studio/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ projectId: string }> };

export default async function MessageStudioProjectPage({ params }: Props) {
  const { projectId } = await params;
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const [projectResult, resourcesResult, coursesResult] = await Promise.all([
    supabase
      .from("message_studio_projects")
      .select(
        "id,workspace_id,course_id,course_name,instructor_name,course_features,target_audience,payment_link,inquiry_link,curriculum_link,replay_link,created_at,updated_at",
      )
      .eq("id", projectId)
      .maybeSingle(),
    supabase
      .from("message_studio_resources")
      .select(
        "id,position,example_text,generated_text,generation_count,generated_model,generated_at",
      )
      .eq("project_id", projectId)
      .order("position"),
    supabase
      .from("courses")
      .select(
        "id,name,instructor_name,payment_link,inquiry_link,curriculum_link,free_gift_link",
      )
      .order("updated_at", { ascending: false }),
  ]);
  const project = projectResult.data;
  const resources = resourcesResult.data;
  if (!project) notFound();

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/services/message-studio">
              <ArrowLeft />
              강의 목록
            </Link>
          </Button>
          <div className="mx-3 h-5 w-px bg-border" />
          <span className="truncate font-semibold">{project.course_name}</span>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
        <MessageStudioProjectEditor
          initialProject={project as MessageStudioProject}
          courses={(coursesResult.data ?? []) as MessageStudioCourseOption[]}
          initialResources={(resources ?? []).map((resource) => ({
            ...(resource as MessageStudioResource),
            generated_text: normalizeGeneratedMessage(
              resource.position,
              resource.generated_text,
              project as MessageStudioProject,
            ),
          }))}
        />
      </div>
    </main>
  );
}
