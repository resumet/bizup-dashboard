import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { briefSchema, publicAppearanceSchema } from "@/lib/youtube-management/model";
import { MediaError, mediaError, privateHeaders, publicMedia, readMediaInput } from "@/lib/youtube-management/server";
export const runtime="nodejs";
type Context={params:Promise<{kind:string;token:string}>};
const briefInput=z.object({brief:briefSchema,revision:z.number().int().nonnegative()});
export async function GET(_:Request,{params}:Context){try{const {kind,token}=await params;return Response.json(await publicMedia(token,z.enum(["brief","schedule"]).parse(kind)),{headers:privateHeaders});}catch(error){return mediaError(error);}}
export async function POST(request:Request,{params}:Context){
  try{
    const {kind,token}=await params;
    if(!["brief","schedule"].includes(kind)|| !/^[a-f0-9]{48}$/.test(token))throw new MediaError("공개되지 않았거나 만료된 주소입니다.",404);
    const raw=await readMediaInput(request);const payload=kind==="brief"?briefInput.parse(raw):publicAppearanceSchema.parse(raw);
    const {data,error}=await createAdminClient().rpc("update_public_youtube_media",{p_token:token,p_kind:kind,p_payload:payload});
    if(error){if(error.message.includes("NOT_FOUND"))throw new MediaError("공개되지 않았거나 만료된 주소입니다.",404);if(error.message.includes("CONFLICT"))throw new MediaError("다른 사람이 수정했습니다. 새로고침 후 다시 확인해 주세요.",409);throw new MediaError("저장하지 못했습니다. 다시 시도해 주세요.",500);}
    return Response.json(data,{headers:privateHeaders});
  }catch(error){return mediaError(error);}
}
