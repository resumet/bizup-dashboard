import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { MediaError } from "./server";
import { BRIEF_FIELDS, briefMarkdown, type Brief, type CourseMedia } from "./model";
export const DEFAULT_NOTION_PARENT="37595b24-93eb-804e-9b82-000bcc225198";
function key(){const secret=process.env.NOTION_CONNECTION_ENCRYPTION_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret)throw new MediaError("연결 저장 키가 설정되지 않았습니다.",500);return createHash("sha256").update(`notion-media:${secret}`).digest();}
export function encryptNotionToken(token:string,workspaceId:string){const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",key(),iv);cipher.setAAD(Buffer.from(workspaceId));const bytes=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(value=>value.toString("base64url")).join(".");}
export function decryptNotionToken(value:string,workspaceId:string){const [iv,tag,bytes]=value.split(".").map(part=>Buffer.from(part,"base64url"));const cipher=createDecipheriv("aes-256-gcm",key(),iv);cipher.setAAD(Buffer.from(workspaceId));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(bytes),cipher.final()]).toString("utf8");}
export async function notionRequest(token:string,path:string,method="GET",body?:unknown){
  const response=await fetch(`https://api.notion.com/v1/${path}`,{method,headers:{Authorization:`Bearer ${token}`,"Notion-Version":"2026-03-11","Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000),cache:"no-store"});
  if(!response.ok)throw new MediaError(response.status===401?"노션 연결 토큰을 확인해 주세요.":response.status===403||response.status===404?"노션 연결에 대상 데이터베이스 접근 권한을 추가해 주세요.":"노션 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",502);
  return response.json();
}
function text(value:string){return [{type:"text",text:{content:value}}];}
export function notionBlocks(brief:Brief){
  const blocks:unknown[]=[];let section="";
  for(const field of BRIEF_FIELDS){
    if(section!==field.section){section=field.section;blocks.push({object:"block",type:"heading_2",heading_2:{rich_text:text(section)}});}
    blocks.push({object:"block",type:"heading_3",heading_3:{rich_text:text(field.label)}});
    const value=brief[field.key]||"미입력";
    for(let offset=0;offset<value.length;offset+=1800)blocks.push({object:"block",type:"paragraph",paragraph:{rich_text:text(value.slice(offset,offset+1800))}});
  }
  return blocks;
}
export async function exportNotion(token:string,parent:{id:string;kind:"data_source"|"page";titleProperty:string},course:Pick<CourseMedia,"name"|"instructor_name"|"cohort">,brief:Brief,pageId?:string|null){
  const title=`${course.instructor_name} · ${course.name}${course.cohort?` · ${course.cohort}`:""}`.slice(0,200);
  const properties=parent.kind==="data_source"?{[parent.titleProperty]:{title:text(title)}}:{title:{title:text(title)}};
  if(pageId){
    await notionRequest(token,`pages/${pageId}/markdown`,"PATCH",{type:"replace_content",replace_content:{new_str:briefMarkdown(course,brief)}});
    return notionRequest(token,`pages/${pageId}`,"PATCH",{properties});
  }
  return notionRequest(token,"pages","POST",{parent:parent.kind==="data_source"?{type:"data_source_id",data_source_id:parent.id}:{type:"page_id",page_id:parent.id},properties,children:notionBlocks(brief)});
}
