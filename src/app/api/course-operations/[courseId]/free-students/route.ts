import { authorizeFreeStudents, FreeStudentsError } from "@/lib/free-students/server";
import { syncFreeStudents } from "@/lib/free-students/sync";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const context = await authorizeFreeStudents(courseId);
    const input = z.object({ sourceUrl: z.string().trim().max(2048).optional() }).parse(await request.json().catch(() => ({})));
    return Response.json(await syncFreeStudents(context, input.sourceUrl), { headers });
  } catch (error) {
    const message = error instanceof Error && error.name !== "TimeoutError" ? error.message : "가져오기 시간이 초과되었습니다. 다시 시도해 주세요.";
    return Response.json({ message }, { status: error instanceof FreeStudentsError ? error.status : 400, headers });
  }
}
