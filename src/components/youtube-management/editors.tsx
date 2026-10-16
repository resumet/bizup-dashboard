"use client";
import { useState } from "react";
import { Copy, ExternalLink, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BRIEF_FIELDS, REQUEST_STATUSES, emptyAppearance, type Appearance, type Brief } from "@/lib/youtube-management/model";

export function MediaNotice({message,onClose}:{message:string;onClose:()=>void}){
  return message ? <div role="status" className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-xl items-center gap-3 rounded-xl border bg-popover p-4 text-sm shadow-lg"><p className="min-w-0 flex-1 break-words">{message}</p><Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="알림 닫기"><X /></Button></div>:null;
}
export async function mediaRequest(url:string,payload:unknown){
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const body=await response.json();if(!response.ok)throw new Error(body.message||"저장하지 못했습니다.");return body;
}
export function BriefEditor({initial,revision,onSave}:{initial:Brief;revision:number;onSave:(brief:Brief,revision:number)=>Promise<number>}){
  const [brief,setBrief]=useState(initial);const [saved,setSaved]=useState(initial);const [version,setVersion]=useState(revision);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const changed=JSON.stringify(brief)!==JSON.stringify(saved);
  return <form className="space-y-6" onSubmit={async event=>{event.preventDefault();setBusy(true);try{setVersion(await onSave(brief,version));setSaved(brief);setMessage("출연 요청서를 저장했습니다.");}catch(error){setMessage(error instanceof Error?error.message:"저장하지 못했습니다.");}finally{setBusy(false);}}}>
    {BRIEF_FIELDS.map((field,index)=><div key={field.key} className="space-y-3">
      {index===0||BRIEF_FIELDS[index-1].section!==field.section?<h2 className="pt-3 text-lg font-semibold">{field.section}</h2>:null}
      <label className="block space-y-2"><span className="text-sm font-medium">{field.label}</span><Textarea rows={field.key==="scenes"?7:3} value={brief[field.key]} maxLength={8000} disabled={busy} onChange={event=>setBrief(current=>({...current,[field.key]:event.target.value}))} /></label>
    </div>)}
    <div className="flex justify-end"><Button disabled={busy||!changed}><Save />{busy?"저장 중…":changed?"출연 요청서 저장":"저장됨"}</Button></div>
    <MediaNotice message={message} onClose={()=>setMessage("")} />
  </form>;
}
function localDate(value:string|null){if(!value)return "";const date=new Date(value);return Number.isFinite(date.getTime())?new Date(date.getTime()+9*3600000).toISOString().slice(0,16):"";}
export function AppearanceEditor({initial,publicMode=false,suggestions=[],onSave,onDelete,onRequest}:{initial:Appearance[];publicMode?:boolean;suggestions?:Array<{channelName:string;channelUrl:string}>;onSave:(row:Appearance)=>Promise<Appearance>;onDelete?:(row:Appearance)=>Promise<void>;onRequest?:(row:Appearance)=>Promise<void>}){
  const [rows,setRows]=useState(initial);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  function update(index:number,patch:Partial<Appearance>){setRows(current=>current.map((row,i)=>i===index?{...row,...patch}:row));}
  return <div className="space-y-4">
    {!publicMode&&<div className="flex justify-end"><Button variant="outline" disabled={busy} onClick={()=>setRows(current=>[...current,emptyAppearance()])}><Plus />출연 추가</Button></div>}
    <datalist id="appearance-channel-suggestions">{suggestions.map((item,index)=><option key={index} value={item.channelName}>{item.channelUrl}</option>)}</datalist>
    {!rows.length&&<p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">등록된 출연 요청이 없습니다.</p>}
    {rows.map((row,index)=><form key={row.id||`new-${index}`} className="space-y-4 rounded-xl border p-4" onSubmit={async event=>{event.preventDefault();setBusy(true);try{const saved=await onSave(row);update(index,saved);setMessage("출연 정보를 저장했습니다.");}catch(error){setMessage(error instanceof Error?error.message:"저장하지 못했습니다.");}finally{setBusy(false);}}}>
      {publicMode?<h2 className="text-lg font-semibold">{row.channel_name}</h2>:<div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm">채널명<Input aria-label={`${index+1}번 채널명`} list="appearance-channel-suggestions" value={row.channel_name} required maxLength={200} disabled={busy} onChange={event=>{const name=event.target.value;const match=suggestions.find(item=>item.channelName===name);update(index,{channel_name:name,...(match?{channel_url:match.channelUrl}:{})});}} /></label>
        <label className="space-y-2 text-sm">채널 주소<Input type="url" value={row.channel_url} disabled={busy} onChange={event=>update(index,{channel_url:event.target.value})} /></label>
        <label className="space-y-2 text-sm">게시된 영상 주소<Input type="url" value={row.video_url} disabled={busy} onChange={event=>update(index,{video_url:event.target.value})} /></label>
        <label className="space-y-2 text-sm">랜딩 UTM<Input value={row.landing_utm} maxLength={2000} disabled={busy} onChange={event=>update(index,{landing_utm:event.target.value})} /></label>
      </div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2 text-sm">출연 여부<select aria-label={`${index+1}번 출연 여부`} className="h-10 w-full rounded-md border bg-background px-3" value={row.request_status} disabled={busy} onChange={event=>update(index,{request_status:event.target.value as Appearance["request_status"]})}>{Object.entries(REQUEST_STATUSES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-2 text-sm">촬영 일정 (한국시간)<Input aria-label={`${index+1}번 촬영 일정`} type="datetime-local" value={localDate(row.filming_at)} disabled={busy} onChange={event=>update(index,{filming_at:event.target.value?new Date(`${event.target.value}:00+09:00`).toISOString():null,...(!event.target.value?{filming_confirmed:false}:{})})} /></label>
        <label className="space-y-2 text-sm">촬영 확정<select aria-label={`${index+1}번 촬영 확정`} className="h-10 w-full rounded-md border bg-background px-3" value={row.filming_confirmed?"yes":"no"} disabled={busy} onChange={event=>update(index,{filming_confirmed:event.target.value==="yes"})}><option value="no">일정 협의 중</option><option value="yes">촬영 일정 확정</option></select></label>
        <label className="space-y-2 text-sm">작성자<Input value={row.respondent} maxLength={100} disabled={busy} onChange={event=>update(index,{respondent:event.target.value})} /></label>
      </div>
      <label className="block space-y-2 text-sm">기타 메모<Textarea aria-label={`${index+1}번 메모`} value={row.note} maxLength={5000} disabled={busy} onChange={event=>update(index,{note:event.target.value})} /></label>
      <div className="flex flex-wrap justify-end gap-2">
        {row.video_url&&/^https?:\/\//i.test(row.video_url)&&<Button asChild variant="outline"><a href={row.video_url} target="_blank" rel="noopener noreferrer"><ExternalLink />영상 보기</a></Button>}
        {!publicMode&&onRequest&&row.id&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void onRequest(row).then(()=>setMessage("출연 요청문을 복사했습니다.")).catch(error=>setMessage(error.message))}><Copy />출연 요청문 복사</Button>}
        {!publicMode&&<Button type="button" variant="ghost" disabled={busy} aria-label={`${index+1}번 출연 삭제`} onClick={async()=>{if(!window.confirm("출연 정보를 삭제하시겠습니까?"))return;setBusy(true);try{if(row.id&&onDelete)await onDelete(row);setRows(current=>current.filter((_,i)=>i!==index));setMessage("삭제했습니다.");}catch(error){setMessage(error instanceof Error?error.message:"삭제하지 못했습니다.");}finally{setBusy(false);}}}><Trash2 /></Button>}
        <Button disabled={busy}><Save />{busy?"저장 중…":"저장"}</Button>
      </div>
    </form>)}
    <MediaNotice message={message} onClose={()=>setMessage("")} />
  </div>;
}
