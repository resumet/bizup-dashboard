import { intakeSettingsSchema } from "@/lib/instructor-intake/model";
import {
  intakeApiError,
  intakeMember,
  intakeSettings,
  removePhotos,
} from "@/lib/instructor-intake/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(request: Request) {
  try {
    const { user, workspaceId } = await intakeMember();
    const current = await intakeSettings(workspaceId);
    const input = intakeSettingsSchema.parse(await request.json());
    const currentPaths = Object.values(current.exampleImagePaths).flat();
    const nextPaths = Object.values(input.exampleImagePaths).flat();
    if (nextPaths.some((path) => !currentPaths.includes(path)))
      throw new Error("저장되지 않은 예시 이미지가 포함되어 있습니다.");
    const { error } = await createAdminClient()
      .from("instructor_intake_settings")
      .upsert({
        workspace_id: workspaceId,
        examples: input.examples,
        example_image_paths: input.exampleImagePaths,
        updated_by: user.id,
      });
    if (error) throw error;
    await removePhotos(currentPaths.filter((path) => !nextPaths.includes(path)));
    return Response.json({ ok: true });
  } catch (error) {
    return intakeApiError(error);
  }
}
