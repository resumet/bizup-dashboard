import { z } from "zod";
import type { LandingUtm } from "@/lib/course-landing-utms/model";

export const BRIEF_FIELDS = [
  { key: "basicInfo", section: "1. 기본 정보", label: "이름 및 활동명, 강사님 연락처" },
  { key: "topic", section: "2. 강의 및 콘텐츠 소개", label: "주요 강의 주제 및 내용" },
  { key: "studentResults", section: "2. 강의 및 콘텐츠 소개", label: "주요 수강생 성과 사례" },
  { key: "strengths", section: "2. 강의 및 콘텐츠 소개", label: "강의·콘텐츠 강점 또는 차별점" },
  { key: "onlineChannels", section: "3. 온라인 채널 정보", label: "운영 중인 유튜브·인스타그램·블로그 링크" },
  { key: "previousAppearances", section: "3. 온라인 채널 정보", label: "이전 출연 영상 또는 프로필 사진 링크" },
  { key: "desiredChannels", section: "4. 출연 관련 희망 사항", label: "출연 희망 채널 및 개수" },
  { key: "goals", section: "4. 출연 관련 희망 사항", label: "이번 출연을 통해 기대하는 바" },
  { key: "concept", section: "4. 출연 관련 희망 사항", label: "희망 촬영 컨셉 및 레퍼런스" },
  { key: "thumbnail", section: "4. 출연 관련 희망 사항", label: "희망 썸네일 방향" },
  { key: "intro", section: "4. 출연 관련 희망 사항", label: "희망 인트로 멘트" },
  { key: "scenes", section: "5. 영상에 포함되었으면 하는 필수 장면", label: "촬영 장면·장소·소품 및 스토리보드" },
  { key: "outro", section: "6. 마무리 멘트 (아웃트로 CTA)", label: "희망 마무리 멘트" },
  { key: "notes", section: "7. 기타 전달하고 싶은 내용", label: "기타 전달 사항" },
] as const;
export type Brief = Record<(typeof BRIEF_FIELDS)[number]["key"], string>;
const briefShape = Object.fromEntries(BRIEF_FIELDS.map(field => [field.key,z.string().max(8000).default("")])) as Record<keyof Brief,z.ZodDefault<z.ZodString>>;
export const briefSchema = z.object(briefShape);
export const REQUEST_STATUSES = { planned: "요청전", requested: "요청함", confirmed: "출연 확정", declined: "출연 불가" } as const;
const webUrl = z.string().trim().max(4000).refine(value => !value || /^https?:\/\//i.test(value) && (() => { try { const url = new URL(value); return !url.username && !url.password; } catch { return false; } })(), "http 또는 https 주소를 입력해 주세요.");
const appearanceBase = z.object({
  channel_name: z.string().trim().min(1,"채널명을 입력해 주세요.").max(200), channel_url: webUrl, video_url: webUrl,
  landing_utm: z.string().max(4000), request_status: z.enum(["planned","requested","confirmed","declined"]),
  filming_date: z.iso.date().nullable(), upload_date: z.iso.date().nullable(), filming_confirmed: z.boolean(), is_internal: z.boolean().default(false), note: z.string().max(5000), respondent: z.string().max(100),
});
const appearanceScheduleRules = appearanceBase
  .refine(value => !value.filming_confirmed || value.request_status === "confirmed", "출연 확정 후 촬영 일정을 확정해 주세요.")
  .refine(value => !value.filming_confirmed || value.filming_date, "촬영 확정 시 촬영일을 입력해 주세요.")
  .refine(value => !value.filming_date || value.filming_confirmed, "촬영일정확정 후 촬영일을 입력해 주세요.")
  .refine(value => !value.upload_date || value.request_status === "confirmed", "출연 확정 후 업로드 일정을 입력해 주세요.");
export const appearanceSchema = appearanceScheduleRules;
export const publicAppearanceSchema = appearanceBase
  .pick({ filming_date:true,upload_date:true,filming_confirmed:true,note:true,respondent:true })
  .extend({request_status:z.enum(["confirmed","declined"], {error:"출연 확정 또는 출연 불가를 선택해 주세요."}),video_url:webUrl.optional(),id:z.uuid(),revision:z.number().int().nonnegative()})
  .refine(value => !value.filming_confirmed || value.request_status === "confirmed", "출연 확정 후 촬영 일정을 확정해 주세요.")
  .refine(value => !value.filming_confirmed || value.filming_date, "촬영 확정 시 촬영일을 입력해 주세요.")
  .refine(value => !value.filming_date || value.filming_confirmed, "촬영일정확정 후 촬영일을 입력해 주세요.")
  .refine(value => !value.upload_date || value.request_status === "confirmed", "출연 확정 후 업로드 일정을 입력해 주세요.");
export type Appearance = z.infer<typeof appearanceSchema> & { id:string; revision:number };
export type CourseMedia = { id:string; name:string; instructor_name:string; cohort:string; status:string; free_webinar_at:string | null };
export type YoutubeSettings = { public_enabled:boolean; public_token:string; public_short_code:string; brief_enabled:boolean; brief_token:string; brief_short_code:string; brief:Brief; brief_revision:number; notion_page_id:string|null; notion_url:string; notion_public_url:string; notion_synced_revision:number|null };
export type MediaData = { course:CourseMedia; settings:YoutubeSettings; appearances:Appearance[]; landingUtms:LandingUtm[]; suggestions:Array<{channelName:string;channelUrl:string}> };
export const emptyAppearance = (): Appearance => ({id:"",revision:0,channel_name:"",channel_url:"",video_url:"",landing_utm:"",request_status:"planned",filming_date:null,upload_date:null,filming_confirmed:false,is_internal:false,note:"",respondent:""});
export function briefMarkdown(course: Pick<CourseMedia,"name"|"instructor_name">, brief:Brief) {
  const lines = [`# ${course.instructor_name} · ${course.name} 출연 요청서`];
  let section = "";
  for (const field of BRIEF_FIELDS) {
    if (section !== field.section) { section=field.section; lines.push(`\n## ${section}`); }
    lines.push(`\n### ${field.label}\n\n${brief[field.key] || "미입력"}`);
  }
  return lines.join("\n");
}
