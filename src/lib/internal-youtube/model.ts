import { z } from "zod";
const url = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}, "https://로 시작하는 올바른 주소를 입력해 주세요.");
const date = z.union([z.iso.date(), z.literal("")]).transform(value => value || null);
export const channelSchema = z.object({ name: z.string().trim().min(1, "채널 이름을 입력해 주세요.").max(200), manager_name: z.string().trim().max(200), channel_url: url });
export const appearanceSchema = z.object({ course_id: z.uuid(), channel_id: z.uuid(), filming_date: date, location: z.string().trim().max(500), original_drive_url: url, edited_drive_url: url, upload_date: date, published_url: url });
export type InternalChannel = z.infer<typeof channelSchema> & { id: string; revision: number };
export type InternalAppearance = z.infer<typeof appearanceSchema> & { id: string; revision: number };
export type InternalCourse = { id: string; name: string; instructor_name: string; status: string; free_webinar_at: string | null };
export type InternalYoutubeData = { channels: InternalChannel[]; appearances: InternalAppearance[]; courses: InternalCourse[] };
