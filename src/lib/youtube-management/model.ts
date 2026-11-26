import { z } from "zod";
import type { LandingUtm } from "@/lib/course-landing-utms/model";
import type { YoutubeFilmingAlertWeeks } from "./settings";

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
export type YoutubeSettings = { public_enabled:boolean; public_token:string; public_short_code:string; appearance_not_required:boolean };
export type MediaData = { course:CourseMedia; settings:YoutubeSettings; appearances:Appearance[]; landingUtms:LandingUtm[]; suggestions:Array<{channelName:string;channelUrl:string}>; filmingAlertWeeks:YoutubeFilmingAlertWeeks };
export const emptyAppearance = (): Appearance => ({id:"",revision:0,channel_name:"",channel_url:"",video_url:"",landing_utm:"",request_status:"planned",filming_date:null,upload_date:null,filming_confirmed:false,is_internal:false,note:"",respondent:""});
