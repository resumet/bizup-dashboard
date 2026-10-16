import { z } from "zod";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";
import { MediaError, mediaError, privateHeaders, readMediaInput } from "@/lib/youtube-management/server";

export const runtime = "nodejs";
const notificationId = z.string().regex(/^[1-9][0-9]{0,17}$/);

export async function GET(request: Request) {
  try {
    const { admin, membership, user } = await requireCourseDocumentMember();
    const query = new URL(request.url).searchParams;
    const args = { p_workspace_id: membership.workspace_id, p_user_id: user.id };
    if (query.get("count") === "1") {
      const { data, error } = await admin.rpc("media_notification_unread_count", args);
      if (error) throw new MediaError("알림 수를 불러오지 못했습니다.", 500);
      return Response.json({ unreadCount: Number(data) }, { headers: privateHeaders });
    }
    const section = z.enum(["unread", "read"]).parse(query.get("section") ?? "unread");
    const before = query.get("before");
    const { data, error } = await admin.rpc("media_notification_feed", {
      ...args, p_read: section === "read", p_before_id: before ? notificationId.parse(before) : null,
    });
    if (error) throw new MediaError("알림을 불러오지 못했습니다.", 500);
    return Response.json(data, { headers: privateHeaders });
  } catch (error) { return mediaError(error); }
}

export async function POST(request: Request) {
  try {
    const { admin, membership, user } = await requireCourseDocumentMember();
    const { id } = z.object({ id: notificationId }).strict().parse(await readMediaInput(request));
    const { data, error } = await admin.rpc("read_media_notification", {
      p_workspace_id: membership.workspace_id, p_user_id: user.id, p_notification_id: id,
    });
    if (error) throw new MediaError(error.message.includes("NOT_FOUND") ? "알림을 찾을 수 없습니다." : "읽음 상태를 저장하지 못했습니다.", error.message.includes("NOT_FOUND") ? 404 : 500);
    return Response.json({ readAt: data }, { headers: privateHeaders });
  } catch (error) { return mediaError(error); }
}
