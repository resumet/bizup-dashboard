import { z } from "zod";
import { requireCourseDocumentMember } from "@/lib/course-documents/server";
import { hasAdminAccess } from "@/lib/admin/access";
import { DEFAULT_NOTION_PARENT, encryptNotionToken, notionRequest } from "@/lib/youtube-management/notion";
import { mediaError, privateHeaders, readMediaInput } from "@/lib/youtube-management/server";
export const runtime="nodejs";
export async function GET(){try{const {admin,membership,user}=await requireCourseDocumentMember();const {data,error}=await admin.from("workspace_notion_media_connections").select("parent_id,parent_kind,title_property").eq("workspace_id",membership.workspace_id).maybeSingle();if(error)throw error;return Response.json({configured:!!data,canManage:hasAdminAccess(user.email,membership.role),parentId:data?.parent_id??DEFAULT_NOTION_PARENT,parentKind:data?.parent_kind??"data_source",titleProperty:data?.title_property??"강사명"},{headers:privateHeaders});}catch(error){return mediaError(error);}}
export async function POST(request:Request){try{
  const {admin,membership,user}=await requireCourseDocumentMember();if(!hasAdminAccess(user.email,membership.role))throw new Error("FORBIDDEN");
  const input=z.object({token:z.string().trim().min(20).max(500),parentId:z.uuid(),parentKind:z.enum(["data_source","page"]),titleProperty:z.string().trim().min(1).max(100)}).parse(await readMediaInput(request));
  await notionRequest(input.token,`${input.parentKind==="data_source"?"data_sources":"pages"}/${input.parentId}`);
  const {error}=await admin.from("workspace_notion_media_connections").upsert({workspace_id:membership.workspace_id,token_ciphertext:encryptNotionToken(input.token,membership.workspace_id),parent_id:input.parentId,parent_kind:input.parentKind,title_property:input.titleProperty,updated_at:new Date().toISOString()});if(error)throw error;
  return Response.json({saved:true},{headers:privateHeaders});
}catch(error){return mediaError(error);}}
