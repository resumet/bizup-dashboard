import { z } from "zod";
import {
  intakeMember,
  intakeApiError,
  memberIntake,
  newShareToken,
  removePhotos,
  tokenHash,
} from "@/lib/instructor-intake/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  action: z.enum(["close", "open", "rotate"]),
  revision: z.number().int().min(0),
});
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ intakeId: string }> },
) {
  try {
    const { workspaceId } = await intakeMember();
    const { intakeId } = await params;
    const row = await memberIntake(workspaceId, intakeId);
    const input = schema.parse(await request.json());
    const token =
      input.action === "rotate" ? newShareToken() : row.access_token;
    const { data, error } = await createAdminClient()
      .from("instructor_intakes")
      .update({
        share_enabled: input.action !== "close",
        access_token: token,
        access_token_hash: tokenHash(token),
      })
      .eq("id", row.id)
      .eq("workspace_id", workspaceId)
      .eq("revision", input.revision)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("CONFLICT");
    return Response.json({ ok: true });
  } catch (error) {
    return intakeApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ intakeId: string }> },
) {
  try {
    const { workspaceId } = await intakeMember();
    const { intakeId } = await params;
    const row = await memberIntake(workspaceId, intakeId);
    const { data, error } = await createAdminClient()
      .from("instructor_intakes")
      .delete()
      .eq("id", row.id)
      .eq("workspace_id", workspaceId)
      .select("id,photo_paths")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("NOT_FOUND");
    await removePhotos(data.photo_paths ?? []);
    return Response.json({ ok: true });
  } catch (error) {
    return intakeApiError(error);
  }
}
