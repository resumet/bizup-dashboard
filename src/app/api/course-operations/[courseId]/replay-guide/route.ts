import { z } from "zod";
import { revalidatePath } from "next/cache";
import { courseOperationsApiError } from "@/lib/course-operations/server";
import { salesContext } from "@/lib/post-sales/server";
import { guideSchema } from "@/lib/replay-guide/model";
import { guideState, statusColumns } from "@/lib/replay-guide/server";

const revision = z.number().int().nonnegative();
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["save", "publish"]), revision, draft: guideSchema }),
  z.object({ action: z.literal("access"), revision: revision.positive(), enabled: z.boolean() }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const { admin } = await salesContext(courseId);
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ message: "섹션의 내용과 링크 형식을 확인해 주세요." }, { status: 400 });
    const input = parsed.data;
    if (input.action === "publish" && (!input.draft.title || input.draft.sections.some(s => !s.heading || !(s.body || s.images.length || s.link || s.note)))) {
      throw new Error("안내문 제목과 각 섹션의 제목·내용을 입력해 주세요.");
    }
    const table = admin.from("course_replay_guides");
    const values = input.action === "access" ? { public_enabled: input.enabled } : {
      draft: input.draft, ...(input.action === "publish" && { published: input.draft, public_enabled: true }),
    };
    let result;
    if (input.revision === 0 && input.action !== "access") {
      result = await table.insert({ course_id: courseId, ...values, revision: 1 }).select(statusColumns).single();
    } else {
      let update = table.update({ ...values, revision: input.revision + 1 }).eq("course_id", courseId).eq("revision", input.revision);
      if (input.action === "access") update = update.eq("has_publication", true);
      result = await update.select(statusColumns).maybeSingle();
    }
    if (result.error?.code === "23505" || (!result.error && !result.data)) {
      return Response.json({ message: "다른 화면에서 안내문이 변경되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
    }
    if (result.error) throw new Error("안내문을 저장하지 못했습니다.");
    revalidatePath(`/services/course-operations/${courseId}`);
    return Response.json(guideState(result.data));
  } catch (error) { return courseOperationsApiError(error); }
}
