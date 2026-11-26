import { loadLandingUtms } from "@/lib/course-landing-utms/server";
import { resolveLandingUtm } from "@/lib/youtube-management/utm";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appearanceSchema } from "@/lib/youtube-management/model";
import { loadMedia, mediaMember, MediaError, mediaError, privateHeaders, readMediaInput } from "@/lib/youtube-management/server";
export const runtime="nodejs";
type Context={params:Promise<{courseId:string}>};
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("access"),kind:z.literal("schedule"),enabled:z.boolean(),regenerate:z.boolean().default(false)}),
  z.object({action:z.literal("appearanceRequirement"),appearanceNotRequired:z.boolean()}),
  z.object({action:z.literal("appearance"),id:z.uuid().optional(),revision:z.number().int().nonnegative(),appearance:appearanceSchema}),
  z.object({action:z.literal("delete"),id:z.uuid(),revision:z.number().int().nonnegative()}),
]);
export async function GET(_:Request,{params}:Context){try{return Response.json(await loadMedia((await params).courseId),{headers:privateHeaders});}catch(error){return mediaError(error);}}
export async function POST(request:Request,{params}:Context){
  try{
    const {courseId}=await params;const {admin}=await mediaMember(courseId);const input=schema.parse(await readMediaInput(request));
    if(input.action==="access"){
      const {data,error}=await admin.from("course_youtube_settings").update({public_enabled:input.enabled,...(input.regenerate?{public_token:randomBytes(24).toString("hex"),public_short_code:randomBytes(12).toString("base64url")} : {}),updated_at:new Date().toISOString()}).eq("course_id",courseId).select("public_enabled,public_token,public_short_code").single();
      if(error)throw new MediaError("공개 설정을 저장하지 못했습니다.",500);return Response.json(data,{headers:privateHeaders});
    }
    if(input.action==="appearanceRequirement"){
      const {data,error}=await admin.from("course_youtube_settings").update({appearance_not_required:input.appearanceNotRequired,updated_at:new Date().toISOString()}).eq("course_id",courseId).select("appearance_not_required").single();
      if(error)throw new MediaError("유튜브 출연 진행 여부를 저장하지 못했습니다.",500);revalidatePath("/");return Response.json(data,{headers:privateHeaders});
    }
    if(input.action==="delete"){
      const {data,error}=await admin.from("course_youtube_appearances").delete().eq("course_id",courseId).eq("id",input.id).eq("revision",input.revision).select("id").maybeSingle();
      if(error)throw new MediaError("출연 정보를 삭제하지 못했습니다.",500);if(!data)throw new MediaError("출연 정보가 변경되었습니다. 새로고침해 주세요.",409);return Response.json({deleted:true},{headers:privateHeaders});
    }
    const landingUtms=await loadLandingUtms(admin,courseId);
    const values={...input.appearance,filming_at:input.appearance.filming_date?`${input.appearance.filming_date}T00:00:00+09:00`:null,landing_utm:resolveLandingUtm(input.appearance.channel_name,input.appearance.landing_utm,landingUtms),updated_at:new Date().toISOString(),revision:input.revision+1};
    const query=input.id?admin.from("course_youtube_appearances").update(values).eq("course_id",courseId).eq("id",input.id).eq("revision",input.revision):admin.from("course_youtube_appearances").insert({...values,course_id:courseId});
    const {data,error}=await query.select("id,revision,channel_name,channel_url,video_url,landing_utm,request_status,filming_date,upload_date,filming_confirmed,is_internal,note,respondent").maybeSingle();
    if(error)throw new MediaError("출연 정보를 저장하지 못했습니다.",500);if(!data)throw new MediaError("다른 사람이 수정했습니다. 새로고침 후 확인해 주세요.",409);return Response.json(data,{headers:privateHeaders});
  }catch(error){return mediaError(error);}
}
