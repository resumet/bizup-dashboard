import {
  createIntakeSchema,
  EMPTY_ANSWERS,
} from "@/lib/instructor-intake/model";
import {
  intakeMember,
  intakeApiError,
  newShareToken,
  tokenHash,
} from "@/lib/instructor-intake/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { user, workspaceId } = await intakeMember();
    const input = createIntakeSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data: course, error: courseError } = await admin
      .from("courses")
      .select("id,name")
      .eq("id", input.courseId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course) throw new Error("선택한 강의를 찾을 수 없습니다.");
    const { data: existing, error: existingError } = await admin
      .from("instructor_intakes")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("course_id", course.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return Response.json(existing);
    const token = newShareToken();
    const { data, error } = await admin
      .from("instructor_intakes")
      .insert({
        workspace_id: workspaceId,
        title: course.name,
        course_id: course.id,
        answers: EMPTY_ANSWERS,
        access_token: token,
        access_token_hash: tokenHash(token),
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (error) {
    return intakeApiError(error);
  }
}
