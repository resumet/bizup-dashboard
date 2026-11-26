import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createShortLink, listShortLinkTypes, ShortLinkError } from "@/lib/short-links/client";
import { registeredReplayType, REPLAY_GUIDE_TYPE_LABEL } from "@/lib/short-links/types";
import { replayPath } from "./model";

export async function issueReplayLink(admin: SupabaseClient, course: { id: string; name: string }, origin: string) {
  const table = admin.from("course_replay_guides");
  const { data, error } = await table.select("token,short_url,public_enabled").eq("course_id", course.id).maybeSingle();
  if (error) throw new ShortLinkError("안내문을 조회하지 못했습니다.");
  if (!data?.public_enabled) throw new ShortLinkError("안내문을 먼저 공개해 주세요.", 409);
  if (data.short_url) return { short_url: data.short_url, existing: true };
  const type = registeredReplayType(await listShortLinkTypes());
  if (!type) throw new ShortLinkError(`BZUP Link 운영자에게 ‘${REPLAY_GUIDE_TYPE_LABEL}’ 전용 유형 등록 또는 활성화를 요청해 주세요.`, 422);
  const base = process.env.APP_ORIGIN || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : origin);
  const result = await createShortLink({ course_id: course.id, type_key: type.key,
    destination_url: new URL(replayPath(data.token), base).href, name: `${course.name} 다시보기 안내문`.slice(0, 120) });
  const saved = await table.update({ short_url: result.short_url }).eq("course_id", course.id).eq("token", data.token).select("course_id").single();
  if (saved.error) throw new ShortLinkError("단축링크를 저장하지 못했습니다. 발급을 다시 눌러 주세요.");
  revalidatePath(`/services/course-operations/${course.id}`);
  return result;
}
