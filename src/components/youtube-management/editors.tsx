"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, Save, Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { validWebUrl, type LandingUtm } from "@/lib/course-landing-utms/model";
import { channelLandingUtm, landingUtmUrl } from "@/lib/youtube-management/utm";
import { Textarea } from "@/components/ui/textarea";
import { BRIEF_FIELDS, REQUEST_STATUSES, emptyAppearance, type Appearance, type Brief } from "@/lib/youtube-management/model";

export function MediaNotice({message,onClose}:{message:string;onClose:()=>void}){
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => close.current(), 3000);
    return () => window.clearTimeout(timer);
  }, [message]);
  return message ? createPortal(<div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-[100] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-md">{message}</div>, document.body) : null;
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
function UrlDialog({value,onChange,title,disabled,notify,icon=false}:{value:string;onChange:(value:string)=>void;title:string;disabled:boolean;notify:(message:string)=>void;icon?:boolean}) {
  return <Dialog>
    <DialogTrigger asChild><Button type="button" size={icon ? "icon-sm" : "sm"} variant="outline" disabled={disabled} aria-label={`${title} ${icon ? "보기" : "설정"}`}>{icon ? <Link2 /> : "설정"}</Button></DialogTrigger>
    <DialogContent aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <Input aria-label={title} type="url" placeholder="https://" maxLength={4000} value={value} disabled={disabled} onChange={event=>onChange(event.target.value)} />
      <p className="text-xs text-muted-foreground">변경 후 표의 저장 버튼을 눌러 주세요.</p>
      <DialogFooter>
        {validWebUrl(value) && <Button type="button" asChild variant="outline"><a href={value} target="_blank" rel="noopener noreferrer"><ExternalLink />열기</a></Button>}
        <Button type="button" variant="outline" disabled={!value} onClick={()=>void navigator.clipboard.writeText(value).then(()=>notify("주소를 복사했습니다.")).catch(()=>notify("복사하지 못했습니다."))}><Copy />복사하기</Button>
        <DialogClose asChild><Button type="button">닫기</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

export function AppearanceEditor({initial,publicMode=false,suggestions=[],landingUtms=[],addRequest=0,onSave,onDelete}:{initial:Appearance[];publicMode?:boolean;suggestions?:Array<{channelName:string;channelUrl:string}>;landingUtms?:LandingUtm[];addRequest?:number;onSave:(row:Appearance)=>Promise<Appearance>;onDelete?:(row:Appearance)=>Promise<void>}){
  const [rows,setRows]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const lastAddRequest=useRef(addRequest);
  useEffect(()=>{
    if(publicMode||addRequest===lastAddRequest.current)return;
    lastAddRequest.current=addRequest;
    setRows(current=>[...current,emptyAppearance()]);
  },[addRequest,publicMode]);
  function update(index:number,patch:Partial<Appearance>){setRows(current=>current.map((row,i)=>i===index?{...row,...patch}:row));}
  async function save(row:Appearance,index:number) {
    setBusy(true); setMessage("");
    try { update(index,await onSave(row));setMessage("출연 정보를 저장했습니다."); }
    catch(error){setMessage(error instanceof Error?error.message:"저장하지 못했습니다.");}
    finally{setBusy(false);}
  }
  const selectClass="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";
  return <div className="min-w-0 space-y-3">
    <datalist id="appearance-channel-suggestions">{suggestions.map((item,index)=><option key={index} value={item.channelName}>{item.channelUrl}</option>)}</datalist>
    <div className="overflow-hidden rounded-lg border">
      <Table className={publicMode?"min-w-[900px]":"min-w-[1160px]"}>
        <TableHeader><TableRow><TableHead>채널이름</TableHead>{!publicMode&&<TableHead className="w-24 text-center">자체 진행</TableHead>}<TableHead>출연여부</TableHead><TableHead>촬영확정</TableHead><TableHead>촬영일정</TableHead><TableHead>UTM</TableHead><TableHead>게시된 영상</TableHead><TableHead className="text-right">저장{!publicMode&&" / 작업"}</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((row,index)=>{
            const formId=`appearance-${publicMode?"public":"admin"}-${index}`;
            const canConfirm=row.request_status==="confirmed";
            const canDate=canConfirm&&row.filming_confirmed;
            return <TableRow key={row.id||`new-${index}`} className={row.request_status === "declined" ? "bg-muted text-muted-foreground hover:bg-muted [&_input]:text-muted-foreground [&_select]:text-muted-foreground" : undefined}>
              <TableCell className="min-w-44 max-w-60">
                {publicMode ? <span className="block max-w-52 truncate font-medium" title={row.channel_name}>{row.channel_name}</span> : <div className="flex items-center gap-1">
                  <Input form={formId} className="h-9 min-w-0" aria-label={`${index+1}번 채널명`} list="appearance-channel-suggestions" value={row.channel_name} required maxLength={200} disabled={busy} onChange={event=>{const name=event.target.value;const match=suggestions.find(item=>item.channelName===name);update(index,{channel_name:name,landing_utm:channelLandingUtm(name,landingUtms),...(match?{channel_url:match.channelUrl}:{})});}} />
                  <UrlDialog title="채널 주소" icon value={row.channel_url} disabled={busy} onChange={value=>update(index,{channel_url:value})} notify={setMessage} />
                </div>}
              </TableCell>
              {!publicMode&&<TableCell className="w-24 text-center"><input form={formId} type="checkbox" aria-label={`${index+1}번 자체 진행`} checked={row.is_internal} disabled={busy} onChange={event=>update(index,{is_internal:event.target.checked})} className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed" /></TableCell>}
              <TableCell className="w-40 min-w-40"><select form={formId} aria-label={`${index+1}번 출연 여부`} className={selectClass} required={publicMode} value={publicMode && !["confirmed","declined"].includes(row.request_status) ? "" : row.request_status} disabled={busy} onChange={event=>{const status=event.target.value as Appearance["request_status"];update(index,{request_status:status,...(status!=="confirmed"?{filming_confirmed:false,filming_at:null}:{})});}}>{publicMode && <option value="">출연 여부 선택</option>}{Object.entries(REQUEST_STATUSES).filter(([value])=>!publicMode||value==="confirmed"||value==="declined").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></TableCell>
              <TableCell className="w-36 min-w-36"><select form={formId} aria-label={`${index+1}번 촬영 확정`} className={selectClass} value={row.filming_confirmed?"yes":"no"} disabled={busy||!canConfirm} onChange={event=>update(index,{filming_confirmed:event.target.value==="yes",...(event.target.value!=="yes"?{filming_at:null}:{})})}><option value="no">일정 협의 중</option><option value="yes">촬영일정확정</option></select></TableCell>
              <TableCell className="w-52 min-w-52"><Input form={formId} className="h-9" aria-label={`${index+1}번 촬영 일정`} title="한국시간" type="datetime-local" required={canDate} value={localDate(row.filming_at)} disabled={busy||!canDate} onChange={event=>update(index,{filming_at:event.target.value?new Date(`${event.target.value}:00+09:00`).toISOString():null})} /></TableCell>
              <TableCell className="min-w-40 max-w-52">
                <div className="flex items-center gap-1">
                  {publicMode ? (row.landing_utm ? (validWebUrl(row.landing_utm) ? <a className="max-w-44 truncate text-sm text-primary underline" href={row.landing_utm} title={row.landing_utm} target="_blank" rel="noopener noreferrer">{row.landing_utm}</a> : <span className="max-w-44 truncate" title={row.landing_utm}>{row.landing_utm}</span>) : <span className="text-muted-foreground">—</span>) : <select form={formId} className={`${selectClass} max-w-44`} aria-label={`${index+1}번 랜딩 UTM`} value={row.landing_utm} disabled={busy} onChange={event=>update(index,{landing_utm:event.target.value})}>
                    <option value="">{landingUtms.length?"UTM 선택":"등록된 UTM 없음"}</option>
                    {row.landing_utm&&!landingUtms.some(item=>landingUtmUrl(item)===row.landing_utm)&&<option value={row.landing_utm}>기존 UTM</option>}
                    {landingUtms.map(item=><option key={item.id} value={landingUtmUrl(item)}>{item.referral_code||item.channel} · {item.medium}</option>)}
                  </select>}
                  {row.landing_utm&&<Button type="button" variant="ghost" size="icon-sm" aria-label={`${index+1}번 UTM 복사`} onClick={()=>void navigator.clipboard.writeText(row.landing_utm).then(()=>setMessage("UTM을 복사했습니다.")).catch(()=>setMessage("복사하지 못했습니다."))}><Copy /></Button>}
                </div>
              </TableCell>
              <TableCell><UrlDialog title="게시된 영상 주소" value={row.video_url} disabled={busy} onChange={value=>update(index,{video_url:value})} notify={setMessage} /></TableCell>
              <TableCell>
                <form id={formId} className="flex justify-end gap-1" onSubmit={event=>{event.preventDefault();void save(row,index);}}>
                  {!publicMode&&<Button type="button" size="icon-sm" variant="ghost" disabled={busy} aria-label={`${index+1}번 출연 삭제`} onClick={async()=>{if(!window.confirm("출연 정보를 삭제하시겠습니까?"))return;setBusy(true);try{if(row.id&&onDelete)await onDelete(row);setRows(current=>current.filter((_,i)=>i!==index));setMessage("삭제했습니다.");}catch(error){setMessage(error instanceof Error?error.message:"삭제하지 못했습니다.");}finally{setBusy(false);}}}><Trash2 /></Button>}
                  <Button type="submit" variant="outline" size="sm" disabled={busy}>{busy?"저장 중…":"저장"}</Button>
                </form>
              </TableCell>
            </TableRow>;
          })}
          {!rows.length&&<TableRow><TableCell colSpan={publicMode?7:8} className="py-8 text-center text-muted-foreground">등록된 출연 요청이 없습니다.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
    <MediaNotice message={message} onClose={()=>setMessage("")} />
  </div>;
}
