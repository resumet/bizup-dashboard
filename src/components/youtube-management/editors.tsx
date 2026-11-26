"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Hourglass, Save, Trash2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { validWebUrl, type LandingUtm } from "@/lib/course-landing-utms/model";
import { channelLandingUtm, landingUtmUrl } from "@/lib/youtube-management/utm";
import { REQUEST_STATUSES, emptyAppearance, type Appearance } from "@/lib/youtube-management/model";
import { ToastNotice } from "@/components/ui/toast";

export function MediaNotice({message,onClose}:{message:string;onClose:()=>void}){
  return <ToastNotice message={message} tone="info" onDismiss={onClose} />;
}
export async function mediaRequest(url:string,payload:unknown){
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const body=await response.json();if(!response.ok)throw new Error(body.message||"저장하지 못했습니다.");return body;
}
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

export function AppearanceEditor({initial,publicMode=false,suggestions=[],landingUtms=[],addRequest=0,onSave,onDelete,onSaved,onDeleted}:{initial:Appearance[];publicMode?:boolean;suggestions?:Array<{channelName:string;channelUrl:string;alias?:string|null}>;landingUtms?:LandingUtm[];addRequest?:number;onSave:(row:Appearance)=>Promise<Appearance>;onDelete?:(row:Appearance)=>Promise<void>;onSaved?:(row:Appearance)=>void;onDeleted?:(id:string)=>void}){
  const [rows,setRows]=useState(initial);
  const [savedRows,setSavedRows]=useState(initial);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const lastAddRequest=useRef(addRequest);
  useEffect(()=>{
    if(publicMode||addRequest===lastAddRequest.current)return;
    lastAddRequest.current=addRequest;
    setRows(current=>[...current,emptyAppearance()]);
  },[addRequest,publicMode]);
  function update(index:number,patch:Partial<Appearance>){setRows(current=>current.map((row,i)=>i===index?{...row,...patch}:row));}
  function persist(row:Appearance,index:number) {
    return onSave(row).then((saved) => {
      update(index,saved);
      setSavedRows(current=>{const next=[...current];next[index]=saved;return next;});
      onSaved?.(saved);
      return saved;
    });
  }
  async function saveAll() {
    const changedRows=rows.map((row,index)=>({row,index})).filter(({row,index})=>JSON.stringify(row)!==JSON.stringify(savedRows[index]));
    if(!changedRows.length)return;
    setBusy(true); setMessage("");
    try { for(const {row,index} of changedRows)await persist(row,index);setMessage("출연 정보를 저장했습니다."); }
    catch(error){setMessage(error instanceof Error?error.message:"저장하지 못했습니다.");}
    finally{setBusy(false);}
  }
  async function autoSaveVideo(index:number) {
    const row=rows[index];
    if(!row?.id||row.video_url===savedRows[index]?.video_url)return;
    setBusy(true); setMessage("");
    try { await persist(row,index);setMessage("게시된 영상 주소를 저장했습니다."); }
    catch(error){setMessage(error instanceof Error?error.message:"게시된 영상 주소를 저장하지 못했습니다.");}
    finally{setBusy(false);}
  }
  const hasChanges=rows.some((row,index)=>JSON.stringify(row)!==JSON.stringify(savedRows[index]));
  const selectClass="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";
  return <div className="min-w-0 space-y-3">
    <datalist id="appearance-channel-suggestions">{suggestions.flatMap((item,index)=>[
      <option key={`${index}-name`} value={item.channelName}>{item.channelUrl}</option>,
      ...(item.alias ? [<option key={`${index}-alias`} value={item.alias}>{item.channelName}</option>] : []),
    ])}</datalist>
    <div className="flex justify-end"><Button type="button" disabled={busy||!hasChanges} onClick={()=>void saveAll()}>{busy?<Hourglass className="animate-spin"/>:<Save />}{busy?"저장 중":"저장"}</Button></div>
    <div className="overflow-hidden rounded-lg border">
      <Table className={publicMode?"min-w-[1040px]":"min-w-[1300px]"}>
        <TableHeader><TableRow><TableHead>채널이름</TableHead>{!publicMode&&<TableHead className="w-24 text-center">자체 진행</TableHead>}<TableHead>출연여부</TableHead><TableHead>촬영확정</TableHead><TableHead>촬영일정</TableHead><TableHead>업로드 일정</TableHead><TableHead>UTM</TableHead><TableHead>게시된 영상</TableHead>{!publicMode&&<TableHead className="text-right">작업</TableHead>}</TableRow></TableHeader>
        <TableBody>
          {rows.map((row,index)=>{
            const formId=`appearance-${publicMode?"public":"admin"}-${index}`;
            const canSchedule=row.request_status==="confirmed";
            return <TableRow key={row.id||`new-${index}`} className={row.request_status === "declined" ? "bg-muted text-muted-foreground hover:bg-muted [&_input]:text-muted-foreground [&_select]:text-muted-foreground" : undefined}>
              <TableCell className="min-w-44 max-w-60">
                {publicMode ? <span className="block max-w-52 truncate font-medium" title={row.channel_name}>{row.channel_name}</span> : <div className="flex items-center gap-1">
                  <Input form={formId} className="h-9 min-w-0" aria-label={`${index+1}번 채널명`} list="appearance-channel-suggestions" value={row.channel_name} required maxLength={200} disabled={busy} onChange={event=>{const name=event.target.value;const match=suggestions.find(item=>item.channelName===name||item.alias===name);const channelName=match?.channelName??name;update(index,{channel_name:channelName,landing_utm:channelLandingUtm(channelName,landingUtms),...(match?{channel_url:match.channelUrl}:{})});}} />
                  <UrlDialog title="채널 주소" icon value={row.channel_url} disabled={busy} onChange={value=>update(index,{channel_url:value})} notify={setMessage} />
                </div>}
              </TableCell>
              {!publicMode&&<TableCell className="w-24 text-center"><input form={formId} type="checkbox" aria-label={`${index+1}번 자체 진행`} checked={row.is_internal} disabled={busy} onChange={event=>update(index,{is_internal:event.target.checked})} className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed" /></TableCell>}
              <TableCell className="w-40 min-w-40"><select form={formId} aria-label={`${index+1}번 출연 여부`} className={selectClass} required={publicMode} value={publicMode && !["confirmed","declined"].includes(row.request_status) ? "" : row.request_status} disabled={busy} onChange={event=>{const status=event.target.value as Appearance["request_status"];update(index,{request_status:status,...(status!=="confirmed"?{filming_confirmed:false,filming_date:null,upload_date:null}:{})});}}>{publicMode && <option value="">출연 여부 선택</option>}{Object.entries(REQUEST_STATUSES).filter(([value])=>!publicMode||value==="confirmed"||value==="declined").map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></TableCell>
              <TableCell className="w-36 min-w-36"><select form={formId} aria-label={`${index+1}번 촬영 확정`} className={selectClass} value={row.filming_confirmed?"yes":"no"} disabled={busy||!canSchedule} onChange={event=>update(index,{filming_confirmed:event.target.value==="yes",...(event.target.value!=="yes"?{filming_date:null}:{})})}><option value="no">일정 협의 중</option><option value="yes">촬영일정확정</option></select></TableCell>
              <TableCell className="w-44 min-w-44"><Input form={formId} className="h-9" aria-label={`${index+1}번 촬영 일정`} type="date" required={canSchedule&&row.filming_confirmed} value={row.filming_date??""} disabled={busy||!canSchedule} onChange={event=>update(index,{filming_date:event.target.value||null,filming_confirmed:Boolean(event.target.value)})} /></TableCell>
              <TableCell className="w-44 min-w-44"><Input form={formId} className="h-9" aria-label={`${index+1}번 업로드 일정`} type="date" value={row.upload_date??""} disabled={busy||!canSchedule} onChange={event=>update(index,{upload_date:event.target.value||null})} /></TableCell>
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
              <TableCell className="min-w-56"><Input form={formId} className="h-9" aria-label={`${index+1}번 게시된 영상 주소`} type="url" placeholder="https://" value={row.video_url} disabled={busy} onChange={event=>update(index,{video_url:event.target.value})} onBlur={()=>void autoSaveVideo(index)} /></TableCell>
              {!publicMode&&<TableCell><div className="flex justify-end"><Button type="button" size="icon-sm" variant="ghost" disabled={busy} aria-label={`${index+1}번 출연 삭제`} onClick={async()=>{if(!window.confirm("출연 정보를 삭제하시겠습니까?"))return;setBusy(true);try{if(row.id&&onDelete)await onDelete(row);setRows(current=>current.filter((_,i)=>i!==index));setSavedRows(current=>current.filter((_,i)=>i!==index));if(row.id)onDeleted?.(row.id);setMessage("삭제했습니다.");}catch(error){setMessage(error instanceof Error?error.message:"삭제하지 못했습니다.");}finally{setBusy(false);}}}><Trash2 /></Button></div></TableCell>}
            </TableRow>;
          })}
          {!rows.length&&<TableRow><TableCell colSpan={publicMode?7:9} className="py-8 text-center text-muted-foreground">등록된 출연 요청이 없습니다.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
    <MediaNotice message={message} onClose={()=>setMessage("")} />
  </div>;
}
