import {
  intakeApiError,
  intakeMember,
  uploadSettingsExampleImage,
} from "@/lib/instructor-intake/server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { user, workspaceId } = await intakeMember();
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new Error("예시 사진을 선택해 주세요.");
    const result = await uploadSettingsExampleImage(
      workspaceId,
      user.id,
      file,
      String(form.get("category") ?? ""),
    );
    return Response.json(result, { status: 201 });
  } catch (error) {
    return intakeApiError(error);
  }
}
