import { z } from "zod";
import { revalidatePath } from "next/cache";
import { courseOperationsApiError } from "@/lib/course-operations/server";
import { invalidateCourseOperationsList } from "@/lib/course-operations/list-cache";
import { salesContext, salesVideos } from "@/lib/post-sales/server";
import { draftSchema, salesSnapshot, webLink } from "@/lib/post-sales/model";
import { checkDriveAccess } from "@/lib/post-sales/drive";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check-drive"), url: z.string().max(2048) }),
  z.object({ action: z.literal("set-access"), revision: z.number().int().nonnegative(), enabled: z.boolean() }),
  z.object({ action: z.enum(["save", "publish"]), revision: z.number().int().nonnegative(), draft: draftSchema }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  try {
    const { courseId } = await params;
    const ctx = await salesContext(courseId);
    const input = requestSchema.safeParse(await request.json());
    if (!input.success) throw new Error(input.error.issues[0].message);
    const body = input.data;
    if (body.action === "check-drive") {
      const result = await checkDriveAccess(body.url).catch(() => { throw new Error("드라이브 권한을 확인하지 못했습니다. 주소를 확인하고 다시 시도해 주세요."); });
      return Response.json(result);
    }
    if (body.action === "set-access") {
      const { data, error } = await ctx.admin.rpc("set_post_sales_public_access", {
        p_course: courseId, p_workspace: ctx.workspaceId, p_revision: body.revision, p_enabled: body.enabled,
      });
      if (error?.message === "STALE_REVISION") return Response.json({ message: "다른 화면에서 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요." }, { status: 409 });
      if (error) throw new Error("공개 설정을 저장하지 못했습니다.");
      return Response.json(data);
    }
    const { draft, revision } = body;
    const publish = body.action === "publish";
    const snapshot = publish ? salesSnapshot(draft, ctx.course, await salesVideos(ctx)) : null;
    if (snapshot) {
      if (!draft.title || !draft.recap.trim()) throw new Error("공개할 페이지 제목과 강의 핵심 내용을 입력해 주세요.");
      if (!draft.chatUrl || !draft.giftUrl || !draft.replayUrl) throw new Error("무료 단톡방, 무료 선물, 다시보기 링크를 입력해 주세요.");
      if (!webLink(snapshot.paymentUrl)) throw new Error("강의 상세페이지에 정규과정 결제링크를 먼저 저장해 주세요.");
      if (draft.videoId && !snapshot.videoUrl) throw new Error("선택한 출연영상이 변경되었습니다. 새로고침 후 다시 선택해 주세요.");
    }
    const origin = process.env.APP_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : new URL(request.url).origin);
    const { data, error } = await ctx.admin.rpc("save_course_post_sales_page", {
      p_course: courseId, p_workspace: ctx.workspaceId, p_revision: revision, p_draft: draft, p_snapshot: snapshot, p_origin: new URL(origin).origin,
    });
    if (error?.message === "STALE_REVISION" || error?.message === "PAYMENT_CHANGED") {
      return Response.json({ message: "다른 화면에서 정보가 변경되었습니다. 새로고침 후 다시 저장해 주세요." }, { status: 409 });
    }
    if (error) throw new Error("사후 세일즈 페이지를 저장하지 못했습니다.");
    if (publish) {
      invalidateCourseOperationsList();
      revalidatePath(`/services/course-operations/${courseId}`);
    }
    return Response.json(data);
  } catch (error) { return courseOperationsApiError(error); }
}
