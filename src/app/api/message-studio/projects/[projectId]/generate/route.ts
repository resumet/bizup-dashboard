import {
  generateCourseMessages,
  MESSAGE_STUDIO_MODEL,
} from "@/lib/message-studio/generate";
import {
  apiError,
  requireMessageStudioProject,
} from "@/lib/message-studio/server";
import {
  allResourcePositions,
  type MessageStudioDraft,
} from "@/lib/message-studio/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Context = { params: Promise<{ projectId: string }> };

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, { params }: Context) {
  const { projectId } = await params;
  const supabase = await createClient();
  try {
    const { user, project, resources } = await requireMessageStudioProject(
      supabase,
      projectId,
    );
    const body = (await request.json()) as { positions?: number[] };
    const positions = [
      ...new Set(
        (body.positions?.length ? body.positions : allResourcePositions()).map(
          Number,
        ),
      ),
    ].toSorted((a, b) => a - b);
    if (
      positions.length === 0 ||
      positions.some(
        (position) =>
          !Number.isInteger(position) || position < 1 || position > 30,
      )
    ) {
      throw new Error("생성할 문자 번호가 올바르지 않습니다.");
    }

    const draft: MessageStudioDraft = project;
    for (const [label, value] of [
      ["강의명", draft.course_name],
      ["강사명", draft.instructor_name],
      ["강의 특징", draft.course_features],
      ["들어야 할 대상", draft.target_audience],
    ]) {
      if (!value.trim()) throw new Error(`${label}을(를) 입력해 주세요.`);
    }

    const messages = await generateCourseMessages({
      project: draft,
      resources,
      positions,
      userId: user.id,
    });
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { error } = await admin.from("message_studio_resources").upsert(
      messages.map((item) => {
        const current = resources.find(
          (resource) => resource.position === item.position,
        );
        return {
          project_id: projectId,
          position: item.position,
          example_text: current?.example_text ?? "",
          generated_text: item.message,
          generation_count: (current?.generation_count ?? 0) + 1,
          generated_model: MESSAGE_STUDIO_MODEL,
          generated_at: now,
          updated_at: now,
        };
      }),
      { onConflict: "project_id,position" },
    );
    if (error) throw new Error(`생성 결과 저장 실패: ${error.code}`);
    await admin
      .from("message_studio_projects")
      .update({ updated_at: now })
      .eq("id", projectId);
    await admin.from("audit_logs").insert({
      workspace_id: project.workspace_id,
      actor_id: user.id,
      event_type: "message_studio.messages_generated",
      entity_type: "message_studio_project",
      entity_id: projectId,
      metadata: { positions, model: MESSAGE_STUDIO_MODEL },
    });
    return Response.json({ messages, model: MESSAGE_STUDIO_MODEL });
  } catch (error) {
    return apiError(error);
  }
}
