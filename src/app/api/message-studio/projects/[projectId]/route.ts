import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  normalizeGeneratedMessage,
  validateMessageLinks,
} from "@/lib/message-studio/link-policy";
import {
  apiError,
  requireMessageStudioProject,
} from "@/lib/message-studio/server";
import type { MessageStudioDraft } from "@/lib/message-studio/types";

type Context = { params: Promise<{ projectId: string }> };

const PROJECT_FIELDS: (keyof MessageStudioDraft)[] = [
  "course_name",
  "instructor_name",
  "course_features",
  "target_audience",
  "payment_link",
  "inquiry_link",
  "curriculum_link",
  "replay_link",
];

function validateLinks(project: MessageStudioDraft) {
  for (const field of [
    "payment_link",
    "inquiry_link",
    "curriculum_link",
    "replay_link",
  ] as const) {
    const value = project[field].trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`${field}는 https:// 형식으로 입력해 주세요.`);
    }
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const { projectId } = await params;
  const supabase = await createClient();
  try {
    const { user, project } = await requireMessageStudioProject(
      supabase,
      projectId,
    );
    const body = (await request.json()) as {
      project?: Partial<MessageStudioDraft>;
      courseId?: string | null;
      resources?: Array<{
        position?: number;
        exampleText?: string;
        generatedText?: string;
      }>;
    };
    const draft = Object.fromEntries(
      PROJECT_FIELDS.map((field) => [
        field,
        String(body.project?.[field] ?? project[field] ?? "").trim(),
      ]),
    ) as MessageStudioDraft;
    if (!draft.course_name) throw new Error("강의명을 입력해 주세요.");
    validateLinks(draft);

    const resources = (body.resources ?? []).map((resource) => ({
      position: Number(resource.position),
      exampleText: String(resource.exampleText ?? ""),
      generatedText: String(resource.generatedText ?? ""),
    }));
    if (
      resources.some(
        (resource) =>
          !Number.isInteger(resource.position) ||
          resource.position < 1 ||
          resource.position > 30,
      )
    ) {
      throw new Error("문자 섹션 번호가 올바르지 않습니다.");
    }
    const generatedPositions = resources
      .filter((resource) => resource.generatedText.trim())
      .map((resource) => resource.position);
    const linkErrors = validateMessageLinks(generatedPositions, draft);
    if (linkErrors.length > 0) throw new Error(linkErrors.join("\n"));
    const normalizedResources = resources.map((resource) => ({
      ...resource,
      generatedText: normalizeGeneratedMessage(
        resource.position,
        resource.generatedText,
        draft,
      ),
    }));

    const admin = createAdminClient();
    const courseId =
      body.courseId === undefined
        ? project.course_id
        : String(body.courseId ?? "").trim() || null;
    if (courseId) {
      const { data: course, error: courseError } = await admin
        .from("courses")
        .select("id")
        .eq("workspace_id", project.workspace_id)
        .eq("id", courseId)
        .maybeSingle();
      if (courseError || !course) {
        throw new Error("선택한 강의를 찾을 수 없습니다.");
      }
    }
    const now = new Date().toISOString();
    const { error: projectError } = await admin
      .from("message_studio_projects")
      .update({ ...draft, course_id: courseId, updated_at: now })
      .eq("id", projectId);
    if (projectError)
      throw new Error(`프로젝트 저장 실패: ${projectError.code}`);
    if (normalizedResources.length > 0) {
      const { error: resourcesError } = await admin
        .from("message_studio_resources")
        .upsert(
          normalizedResources.map((resource) => ({
            project_id: projectId,
            position: resource.position,
            example_text: resource.exampleText,
            generated_text: resource.generatedText,
            updated_at: now,
          })),
          { onConflict: "project_id,position" },
        );
      if (resourcesError)
        throw new Error(`문자 리소스 저장 실패: ${resourcesError.code}`);
    }

    await admin.from("audit_logs").insert({
      workspace_id: project.workspace_id,
      actor_id: user.id,
      event_type: "message_studio.project_saved",
      entity_type: "message_studio_project",
      entity_id: projectId,
      metadata: { resource_count: resources.length },
    });
    return Response.json({
      message: "저장했습니다.",
      resources: normalizedResources.map((resource) => ({
        position: resource.position,
        generatedText: resource.generatedText,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  const { projectId } = await params;
  const supabase = await createClient();
  try {
    const { user, project } = await requireMessageStudioProject(
      supabase,
      projectId,
    );
    const admin = createAdminClient();
    const { error } = await admin
      .from("message_studio_projects")
      .delete()
      .eq("id", projectId);
    if (error) throw new Error(`프로젝트 삭제 실패: ${error.code}`);
    await admin.from("audit_logs").insert({
      workspace_id: project.workspace_id,
      actor_id: user.id,
      event_type: "message_studio.project_deleted",
      entity_type: "message_studio_project",
      entity_id: projectId,
      metadata: { course_name: project.course_name },
    });
    return Response.json({ message: "삭제했습니다." });
  } catch (error) {
    return apiError(error);
  }
}
