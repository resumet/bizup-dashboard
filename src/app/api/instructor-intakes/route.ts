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
    const token = newShareToken();
    const { data, error } = await createAdminClient()
      .from("instructor_intakes")
      .insert({
        workspace_id: workspaceId,
        title: input.title,
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
