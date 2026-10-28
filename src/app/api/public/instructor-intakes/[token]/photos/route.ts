import { z } from "zod";
import {
  intakeApiError,
  publicIntake,
  uploadPhoto,
  uploadMaterialImage,
} from "@/lib/instructor-intake/server";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const row = await publicIntake(token);
    const form = await request.formData();
    const file = form.get("photo");
    const category = String(form.get("category") ?? "");
    const revision = z.coerce.number().int().min(0).parse(form.get("revision"));
    if (!(file instanceof File))
      throw new Error("프로필 사진을 선택해 주세요.");
    const result = category
      ? await uploadMaterialImage(row, file, revision, category)
      : await uploadPhoto(row, file, revision);
    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return intakeApiError(error);
  }
}
