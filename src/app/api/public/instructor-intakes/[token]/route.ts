import { saveSchema } from "@/lib/instructor-intake/model";
import {
  intakeApiError,
  publicIntake,
  updatePublicIntake,
  removePhotos,
} from "@/lib/instructor-intake/server";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const row = await publicIntake(token);
    const input = saveSchema.parse(await request.json());
    if (input.photoPaths.some((path) => !row.photo_paths.includes(path)))
      throw new Error("저장되지 않은 사진이 포함되어 있습니다.");
    const updated = await updatePublicIntake(row, input.revision, {
      answers: input.answers,
      photo_paths: input.photoPaths,
      submitted_at: input.submit ? new Date().toISOString() : null,
    });
    await removePhotos(
      row.photo_paths.filter((path) => !input.photoPaths.includes(path)),
    );
    return Response.json(updated, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return intakeApiError(error);
  }
}
