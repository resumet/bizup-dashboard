import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/message-studio/default-messages";
import { ensureDefaultMessageTemplates } from "@/lib/message-studio/default-template-server";
import {
  apiError,
  requireWorkspaceMembership,
} from "@/lib/message-studio/server";
import { allResourcePositions } from "@/lib/message-studio/types";
import { getAuthenticatedUser } from "@/lib/supabase/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user)
    return Response.json({ message: "로그인이 필요합니다." }, { status: 401 });

  try {
    const body = (await request.json()) as { courseId?: string };
    const courseId = String(body.courseId ?? "").trim();
    if (!courseId)
      return Response.json(
        { message: "강의 대시보드에서 강의를 선택해 주세요." },
        { status: 400 },
      );

    const membership = await requireWorkspaceMembership(user.id);
    const { templates: defaultTemplates } = await ensureDefaultMessageTemplates(
      user.id,
    );
    const defaultByPosition = new Map(
      defaultTemplates.map((template) => [template.position, template.content]),
    );
    const admin = createAdminClient();
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select(
        "id,name,instructor_name,payment_link,inquiry_link,curriculum_link,free_gift_link",
      )
      .eq("workspace_id", membership.workspace_id)
      .eq("id", courseId)
      .maybeSingle();
    if (courseError || !course) {
      throw new Error("선택한 강의를 찾을 수 없습니다.");
    }
    const { data: project, error: projectError } = await admin
      .from("message_studio_projects")
      .insert({
        workspace_id: membership.workspace_id,
        course_id: course.id,
        course_name: course.name,
        instructor_name: course.instructor_name,
        payment_link: course.payment_link,
        inquiry_link: course.inquiry_link,
        curriculum_link: course.curriculum_link,
        replay_link: course.free_gift_link,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (projectError)
      throw new Error(`프로젝트 생성 실패: ${projectError.code}`);

    const { error: resourcesError } = await admin
      .from("message_studio_resources")
      .insert(
        allResourcePositions().map((position) => ({
          project_id: project.id,
          position,
          example_text:
            defaultByPosition.get(position) ??
            DEFAULT_MESSAGE_TEMPLATES[position - 1] ??
            "",
        })),
      );
    if (resourcesError) {
      await admin.from("message_studio_projects").delete().eq("id", project.id);
      throw new Error(`문자 섹션 생성 실패: ${resourcesError.code}`);
    }

    await admin.from("audit_logs").insert({
      workspace_id: membership.workspace_id,
      actor_id: user.id,
      event_type: "message_studio.project_created",
      entity_type: "message_studio_project",
      entity_id: project.id,
      metadata: { course_id: course.id, course_name: course.name },
    });
    return Response.json({ id: project.id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
