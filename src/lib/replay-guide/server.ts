import "server-only";
import { salesContext } from "@/lib/post-sales/server";
import { guideSchema, initialGuide, replayPath, type GuideState } from "./model";

type StatusRow = { revision: number; token: string; public_enabled: boolean; short_url: string | null; has_publication: boolean };
export const statusColumns = "revision,token,public_enabled,short_url,has_publication";
export function guideState(row: StatusRow | null): GuideState {
  return { revision: row?.revision ?? 0, enabled: row?.public_enabled ?? false,
    path: row?.has_publication ? replayPath(row.token) : "", shortUrl: row?.short_url ?? "" };
}

export async function loadGuideEditor(courseId: string) {
  const { course, admin } = await salesContext(courseId);
  const { data, error } = await admin.from("course_replay_guides").select(`draft,${statusColumns}`).eq("course_id", courseId).maybeSingle();
  if (error) throw new Error("다시보기 안내문을 불러오지 못했습니다.");
  return { courseId, draft: data ? guideSchema.parse(data.draft) : initialGuide(course.name), state: guideState(data) };
}
