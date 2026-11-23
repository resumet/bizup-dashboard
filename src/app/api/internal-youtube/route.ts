import { z } from "zod";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";
import { channelSchema, appearanceSchema } from "@/lib/internal-youtube/model";
import { isSelectableCourse } from "@/lib/course-operations/course-status";
import { MediaError, mediaError, privateHeaders, readMediaInput } from "@/lib/youtube-management/server";

export async function POST(request: Request) {
  try {
    const { admin, membership } = await requireCourseDocumentMember();
    const body = z.object({ kind: z.enum(["channel", "appearance"]), action: z.enum(["save", "delete"]), id: z.uuid().optional(), revision: z.number().int().positive().optional(), data: z.unknown().optional() }).parse(await readMediaInput(request));
    const table = body.kind === "channel" ? "internal_youtube_channels" : "internal_youtube_appearances";
    const workspace = membership.workspace_id;
    let current: { course_id?: string } | null = null;
    if (body.id) {
      if (!body.revision) throw new MediaError("페이지를 새로고침한 뒤 다시 시도해 주세요.", 409);
      const found = await admin.from(table).select("*").eq("workspace_id", workspace).eq("id", body.id).eq("revision", body.revision).maybeSingle();
      if (found.error) throw new Error(found.error.message);
      if (!found.data) throw new MediaError("다른 사용자가 변경하거나 삭제했습니다. 새로고침해 주세요.", 409);
      current = found.data;
    }
    if (body.action === "delete") {
      if (!body.id) throw new MediaError("삭제할 항목을 선택해 주세요.");
      const result = await admin.from(table).delete().eq("workspace_id", workspace).eq("id", body.id).eq("revision", body.revision!).select("id").maybeSingle();
      if (result.error?.code === "23503") throw new MediaError("출연 기록에서 사용 중인 채널입니다. 연결된 출연 기록을 변경하거나 삭제해 주세요.");
      if (result.error) throw new Error(result.error.message);
      if (!result.data) throw new MediaError("다른 사용자가 변경했습니다. 새로고침해 주세요.", 409);
    } else {
      const data = body.kind === "channel" ? channelSchema.parse(body.data) : appearanceSchema.parse(body.data);
      if ("course_id" in data) {
        const [course, channel] = await Promise.all([
          admin.from("courses").select("id,status").eq("workspace_id", workspace).eq("id", data.course_id).maybeSingle(),
          admin.from("internal_youtube_channels").select("id").eq("workspace_id", workspace).eq("id", data.channel_id).maybeSingle(),
        ]);
        if (course.error || channel.error) throw new Error("조회 실패");
        if (!course.data || !channel.data) throw new MediaError("강의 또는 채널을 찾을 수 없습니다.", 404);
        if (current?.course_id !== data.course_id && !isSelectableCourse(course.data)) throw new MediaError("진행 중인 강의를 선택해 주세요.");
      }
      const result = body.id
        ? await admin.from(table).update({ ...data, revision: body.revision! + 1 }).eq("workspace_id", workspace).eq("id", body.id).eq("revision", body.revision!).select("id").maybeSingle()
        : await admin.from(table).insert({ ...data, workspace_id: workspace }).select("id").single();
      if (result.error) throw new Error(result.error.message);
      if (!result.data) throw new MediaError("다른 사용자가 변경했습니다. 새로고침해 주세요.", 409);
    }
    return Response.json({ saved: true }, { headers: privateHeaders });
  } catch (error) { return mediaError(error); }
}
