import { mediaMember, mediaError, MediaError, privateHeaders, readMediaInput } from "@/lib/youtube-management/server";
import { decryptNotionToken, exportNotion } from "@/lib/youtube-management/notion";
import { briefSchema } from "@/lib/youtube-management/model";
export const runtime="nodejs";
export const maxDuration=90;
export async function POST(request:Request,{params}:{params:Promise<{courseId:string}>}){
  try{
    const {courseId}=await params;const {admin,course}=await mediaMember(courseId);await readMediaInput(request);
    const {data:connection,error:connectionError}=await admin.from("workspace_notion_media_connections").select("*").eq("workspace_id",course.workspace_id).maybeSingle();
    if(connectionError)throw new MediaError("노션 연결을 불러오지 못했습니다.",500);
    if(!connection)throw new MediaError("유튜브 관리 메인의 노션 연결에서 연결 정보를 먼저 저장해 주세요.");
    const started=new Date().toISOString();const stale=new Date(Date.now()-180000).toISOString();
    const {data:settings,error}=await admin.from("course_youtube_settings").update({notion_sync_started_at:started}).eq("course_id",courseId).or(`notion_sync_started_at.is.null,notion_sync_started_at.lt.${stale}`).select("brief,brief_revision,notion_page_id").maybeSingle();
    if(error)throw new MediaError("노션 반영을 시작하지 못했습니다.",500);if(!settings)throw new MediaError("노션 반영이 진행 중입니다. 잠시 후 확인해 주세요.",409);
    try{
      const result=await exportNotion(decryptNotionToken(connection.token_ciphertext,course.workspace_id),{id:connection.parent_id,kind:connection.parent_kind,titleProperty:connection.title_property},course,briefSchema.parse(settings.brief),settings.notion_page_id);
      const saved={notion_page_id:result.id,notion_url:result.url,notion_public_url:result.public_url??"",notion_synced_revision:settings.brief_revision};
      const {error:saveError}=await admin.from("course_youtube_settings").update(saved).eq("course_id",courseId).eq("notion_sync_started_at",started);
      if(saveError)throw new MediaError("노션 페이지는 생성되었지만 연결 저장에 실패했습니다. 노션에서 생성 결과를 확인해 주세요.",500);
      return Response.json(saved,{headers:privateHeaders});
    }finally{await admin.from("course_youtube_settings").update({notion_sync_started_at:null}).eq("course_id",courseId).eq("notion_sync_started_at",started);}
  }catch(error){return mediaError(error);}
}
