import { loadLandingUtms } from "@/lib/course-landing-utms/server";
import { resolveLandingUtm } from "@/lib/youtube-management/utm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { appearanceSchema, briefSchema } from "@/lib/youtube-management/model";
import { loadMedia, mediaMember, MediaError, mediaError, privateHeaders, readMediaInput } from "@/lib/youtube-management/server";
export const runtime="nodejs";
type Context={params:Promise<{courseId:string}>};
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("access"),kind:z.enum(["brief","schedule"]),enabled:z.boolean(),regenerate:z.boolean().default(false)}),
  z.object({action:z.literal("brief"),brief:briefSchema,revision:z.number().int().nonnegative()}),
  z.object({action:z.literal("appearance"),id:z.uuid().optional(),revision:z.number().int().nonnegative(),appearance:appearanceSchema}),
  z.object({action:z.literal("delete"),id:z.uuid(),revision:z.number().int().nonnegative()}),
]);
export async function GET(_:Request,{params}:Context){try{return Response.json(await loadMedia((await params).courseId),{headers:privateHeaders});}catch(error){return mediaError(error);}}
export async function POST(request:Request,{params}:Context){
  try{
    const {courseId}=await params;const {admin}=await mediaMember(courseId);const input=schema.parse(await readMediaInput(request));
    if(input.action==="access"){
      const prefix=input.kind==="brief"?"brief":"public";
      const {data,error}=await admin.from("course_youtube_settings").update({[`${prefix}_enabled`]:input.enabled,...(input.regenerate?{[`${prefix}_token`]:randomBytes(24).toString("hex"),[`${prefix}_short_code`]:randomBytes(12).toString("base64url")} : {}),updated_at:new Date().toISOString()}).eq("course_id",courseId).select(`${prefix}_enabled,${prefix}_token,${prefix}_short_code`).single();
      if(error)throw new MediaError("공개 설정을 저장하지 못했습니다.",500);return Response.json(data,{headers:privateHeaders});
    }
    if(input.action==="brief"){
      const {data,error}=await admin.from("course_youtube_settings").update({brief:input.brief,brief_revision:input.revision+1,updated_at:new Date().toISOString()}).eq("course_id",courseId).eq("brief_revision",input.revision).select("brief,brief_revision").maybeSingle();
      if(error)throw new MediaError("출연 요청서를 저장하지 못했습니다.",500);if(!data)throw new MediaError("다른 사람이 수정했습니다. 새로고침 후 다시 확인해 주세요.",409);return Response.json(data,{headers:privateHeaders});
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
