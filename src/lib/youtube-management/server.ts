import "server-only";
import { cache } from "react";
import { ZodError } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";
import { buildYoutubeChannelSuggestions } from "@/lib/course-operations/youtube-channels";
import { briefSchema, type MediaData } from "./model";
import { loadLandingUtms } from "@/lib/course-landing-utms/server";
import { resolveLandingUtm, youtubeLandingUtms } from "./utm";
import { parseYoutubeShortPathCode } from "./short-link";

export class MediaError extends Error { constructor(message:string,readonly status=400){super(message);} }
export const privateHeaders = {"Cache-Control":"private, no-store", "X-Robots-Tag":"noindex, nofollow", "Referrer-Policy":"no-referrer"};
export function mediaError(error:unknown) {
  if(error instanceof MediaError)return Response.json({message:error.message},{status:error.status,headers:privateHeaders});
  if(error instanceof ZodError)return Response.json({message:error.issues[0]?.message || "입력값을 확인해 주세요."},{status:400,headers:privateHeaders});
  const message=error instanceof Error ? error.message : "";
  return Response.json({message:message==="UNAUTHORIZED"?"로그인이 필요합니다.":message==="FORBIDDEN"?"관리자 권한이 필요합니다.":"요청을 처리하지 못했습니다. 다시 시도해 주세요."},{status:message==="UNAUTHORIZED"?401:message==="FORBIDDEN"?403:500,headers:privateHeaders});
}
export async function readMediaInput(request:Request){
  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(request.url).origin)throw new MediaError("허용되지 않은 요청입니다.",403);
  if(Number(request.headers.get("content-length"))>160000)throw new MediaError("입력 내용이 너무 큽니다.",413);
  const text=await request.text();if(Buffer.byteLength(text)>160000)throw new MediaError("입력 내용이 너무 큽니다.",413);
  try{return JSON.parse(text);}catch{throw new MediaError("입력값을 확인해 주세요.");}
}
export async function mediaMember(courseId:string){
  const context=await requireCourseDocumentMember();
  if(!/^[a-f0-9-]{36}$/i.test(courseId))throw new MediaError("강의를 찾을 수 없습니다.",404);
  const {data:course,error}=await context.admin.from("courses").select("id,name,instructor_name,cohort,status,free_webinar_at,workspace_id").eq("id",courseId).eq("workspace_id",context.membership.workspace_id).maybeSingle();
  if(error)throw new MediaError("강의를 불러오지 못했습니다.",500);
  if(!course)throw new MediaError("강의를 찾을 수 없습니다.",404);
  return {...context,course};
}
export async function loadMedia(courseId:string):Promise<MediaData>{
  const {admin,course}=await mediaMember(courseId);
  const [settings,appearances,channels,landingUtms]=await Promise.all([
    admin.from("course_youtube_settings").select("public_enabled,public_token,public_short_code,brief_enabled,brief_token,brief_short_code,brief,brief_revision,notion_page_id,notion_url,notion_public_url,notion_synced_revision").eq("course_id",courseId).single(),
    admin.from("course_youtube_appearances").select("id,revision,channel_name,channel_url,video_url,landing_utm,request_status,filming_at,filming_confirmed,is_internal,note,respondent").eq("course_id",courseId).order("sort_order").order("created_at"),
    admin.from("youtube_analyzed_channels").select("channel,position").eq("workspace_id",course.workspace_id).order("position",{ascending:false}).limit(500),
    loadLandingUtms(admin,courseId),
  ]);
  if(settings.error || appearances.error || channels.error)throw new MediaError("유튜브 관리 데이터를 불러오지 못했습니다.",500);
  const youtubeUtms=youtubeLandingUtms(landingUtms);
  return {course,settings:{...settings.data,brief:briefSchema.parse(settings.data.brief)},appearances:appearances.data.map(row=>({...row,landing_utm:resolveLandingUtm(row.channel_name,row.landing_utm,youtubeUtms)})),landingUtms:youtubeUtms,suggestions:buildYoutubeChannelSuggestions(channels.data??[])};
}
export const getPublicYoutubeShare = cache(async (token:string,kind:"brief"|"schedule") => {
  if(!/^[a-f0-9]{48}$/.test(token))throw new MediaError("공개되지 않았거나 만료된 주소입니다.",404);
  const admin=createAdminClient();
  const {data:settings,error}=await admin.from("course_youtube_settings").select("course_id,workspace_id,brief,brief_revision").eq(kind==="brief"?"brief_token":"public_token",token).eq(kind==="brief"?"brief_enabled":"public_enabled",true).maybeSingle();
  if(error)throw new MediaError("데이터를 불러오지 못했습니다.",500);
  if(!settings)throw new MediaError("공개되지 않았거나 만료된 주소입니다.",404);
  const {data:course,error:courseError}=await admin.from("courses").select("id,name,instructor_name,cohort,free_webinar_at,banner_image_path,updated_at").eq("id",settings.course_id).eq("workspace_id",settings.workspace_id).single();
  if(courseError || !course)throw new MediaError("강의를 찾을 수 없습니다.",404);
  return {admin,settings,course};
});
export const resolvePublicYoutubeShortShare = cache(async (code:string) => {
  const parsed=parseYoutubeShortPathCode(code);
  if(!parsed)throw new MediaError("공개되지 않았거나 만료된 주소입니다.",404);
  const admin=createAdminClient();
  const shortColumn=parsed.kind==="brief"?"brief_short_code":"public_short_code";
  const enabledColumn=parsed.kind==="brief"?"brief_enabled":"public_enabled";
  const {data,error}=await admin.from("course_youtube_settings").select("public_token,brief_token").eq(shortColumn,parsed.shortCode).eq(enabledColumn,true).maybeSingle();
  if(error)throw new MediaError("데이터를 불러오지 못했습니다.",500);
  if(!data)throw new MediaError("공개되지 않았거나 만료된 주소입니다.",404);
  const token=parsed.kind==="brief"?data.brief_token:data.public_token;
  if(typeof token!=="string")throw new MediaError("공개되지 않았거나 만료된 주소입니다.",404);
  return {kind:parsed.kind,token};
});
export async function publicMedia(token:string,kind:"brief"|"schedule"){
  const {admin,settings,course}=await getPublicYoutubeShare(token,kind);
  const publicCourse={id:course.id,name:course.name,instructor_name:course.instructor_name,cohort:course.cohort,free_webinar_at:course.free_webinar_at};
  if(kind==="brief")return {course:publicCourse,brief:briefSchema.parse(settings.brief),revision:settings.brief_revision};
  const {data:appearances,error:appearanceError}=await admin.from("course_youtube_appearances").select("id,revision,channel_name,channel_url,video_url,landing_utm,request_status,filming_at,filming_confirmed,note,respondent").eq("course_id",course.id).eq("is_internal",false).order("sort_order").order("created_at");
  if(appearanceError)throw new MediaError("출연 정보를 불러오지 못했습니다.",500);
  const landingUtms=youtubeLandingUtms(await loadLandingUtms(admin,course.id));
  return {course:publicCourse,appearances:appearances.map(row=>({...row,is_internal:false,landing_utm:resolveLandingUtm(row.channel_name,row.landing_utm,landingUtms)}))};
}
