import "server-only";
import { ZodError } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";
import { buildYoutubeChannelSuggestions } from "@/lib/course-operations/youtube-channels";
import { briefSchema, type MediaData } from "./model";

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
  const [settings,appearances,channels]=await Promise.all([
    admin.from("course_youtube_settings").select("public_enabled,public_token,brief_enabled,brief_token,brief,brief_revision,notion_page_id,notion_url,notion_public_url,notion_synced_revision").eq("course_id",courseId).single(),
    admin.from("course_youtube_appearances").select("id,revision,channel_name,channel_url,video_url,landing_utm,request_status,filming_at,filming_confirmed,note,respondent").eq("course_id",courseId).order("sort_order").order("created_at"),
    admin.from("youtube_analyzed_channels").select("channel,position").eq("workspace_id",course.workspace_id).order("position",{ascending:false}).limit(500),
  ]);
  if(settings.error || appearances.error || channels.error)throw new MediaError("유튜브 관리 데이터를 불러오지 못했습니다.",500);
  return {course,settings:{...settings.data,brief:briefSchema.parse(settings.data.brief)},appearances:appearances.data,suggestions:buildYoutubeChannelSuggestions(channels.data??[])};
}
export async function publicMedia(token:string,kind:"brief"|"schedule"){
  if(!/^[a-f0-9]{48}$/.test(token))throw new MediaError("공개되지 않았거나 만료된 주소입니다.",404);
  const admin=createAdminClient();
  const {data:settings,error}=await admin.from("course_youtube_settings").select("course_id,workspace_id,brief,brief_revision").eq(kind==="brief"?"brief_token":"public_token",token).eq(kind==="brief"?"brief_enabled":"public_enabled",true).maybeSingle();
  if(error)throw new MediaError("데이터를 불러오지 못했습니다.",500);
  if(!settings)throw new MediaError("공개되지 않았거나 만료된 주소입니다.",404);
  const {data:course,error:courseError}=await admin.from("courses").select("id,name,instructor_name,cohort").eq("id",settings.course_id).eq("workspace_id",settings.workspace_id).single();
  if(courseError)throw new MediaError("강의를 찾을 수 없습니다.",404);
  if(kind==="brief")return {course,brief:briefSchema.parse(settings.brief),revision:settings.brief_revision};
  const {data:appearances,error:appearanceError}=await admin.from("course_youtube_appearances").select("id,revision,channel_name,channel_url,video_url,landing_utm,request_status,filming_at,filming_confirmed,note,respondent").eq("course_id",course.id).order("sort_order").order("created_at");
  if(appearanceError)throw new MediaError("출연 정보를 불러오지 못했습니다.",500);
  return {course,appearances};
}
