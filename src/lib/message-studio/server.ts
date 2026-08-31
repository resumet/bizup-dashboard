import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAuthenticatedUser,
  type AuthenticatedUser,
} from "@/lib/supabase/auth";
import type {
  MessageStudioProject,
  MessageStudioResource,
} from "@/lib/message-studio/types";

export async function requireMessageStudioProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{
  user: AuthenticatedUser;
  project: MessageStudioProject;
  resources: MessageStudioResource[];
}> {
  const user = await getAuthenticatedUser(supabase);
  if (!user) throw new Error("UNAUTHORIZED");

  const { data: project, error: projectError } = await supabase
    .from("message_studio_projects")
    .select(
      "id,workspace_id,course_id,course_name,instructor_name,course_features,target_audience,payment_link,inquiry_link,curriculum_link,replay_link,created_at,updated_at",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw new Error(`프로젝트 조회 실패: ${projectError.code}`);
  if (!project) throw new Error("NOT_FOUND");

  const { data: resources, error: resourcesError } = await supabase
    .from("message_studio_resources")
    .select(
      "id,position,example_text,generated_text,generation_count,generated_model,generated_at",
    )
    .eq("project_id", projectId)
    .order("position");
  if (resourcesError)
    throw new Error(`문자 리소스 조회 실패: ${resourcesError.code}`);

  return {
    user,
    project: project as MessageStudioProject,
    resources: (resources ?? []) as MessageStudioResource[],
  };
}

export async function requireWorkspaceMembership(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workspace_members")
    .select("workspace_id,role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`워크스페이스 조회 실패: ${error.code}`);
  if (!data) throw new Error("워크스페이스 권한이 없습니다.");
  return data;
}

export function apiError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "처리하지 못했습니다.";
  if (message === "UNAUTHORIZED")
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });
  if (message === "NOT_FOUND")
    return Response.json(
      { message: "문자 제작 프로젝트를 찾을 수 없습니다." },
      { status: 404 },
    );
  return Response.json({ message }, { status: 400 });
}
