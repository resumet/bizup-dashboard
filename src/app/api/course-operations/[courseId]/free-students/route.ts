import { authorizeFreeStudents, FreeStudentsError } from "@/lib/free-students/server";
import { syncFreeStudents } from "@/lib/free-students/sync";

export const runtime = "nodejs";
export const maxDuration = 180;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const context = await authorizeFreeStudents(courseId);
    return Response.json(await syncFreeStudents(context), { headers });
  } catch (error) {
    const message = error instanceof Error && error.name !== "TimeoutError" ? error.message : "가져오기 시간이 초과되었습니다. 다시 시도해 주세요.";
    return Response.json({ message }, { status: error instanceof FreeStudentsError ? error.status : 400, headers });
  }
}
