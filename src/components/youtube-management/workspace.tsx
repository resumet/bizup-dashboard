"use client";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppearanceEditor, BriefEditor, MediaNotice, mediaRequest } from "./editors";
import type { Appearance, MediaData } from "@/lib/youtube-management/model";
export function YoutubeWorkspace({initial,initialTab="schedule"}:{initial:MediaData;initialTab?:"schedule"|"brief"}){
  const [settings,setSettings]=useState(initial.settings);const [tab,setTab]=useState<"schedule"|"brief">(initialTab);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const endpoint=`/api/youtube-management/${initial.course.id}`;
  const enabled=tab==="brief"?settings.brief_enabled:settings.public_enabled;
  const token=tab==="brief"?settings.brief_token:settings.public_token;
  const publicPath=`/public/youtube/${tab}/${token}`;
  async function access(regenerate=false){
    if(regenerate&&!window.confirm("주소를 재발급하면 기존 주소를 사용할 수 없습니다. 재발급하시겠습니까?"))return;
    setBusy(true);try{const result=await mediaRequest(endpoint,{action:"access",kind:tab,enabled:regenerate?enabled:!enabled,regenerate});setSettings(current=>({...current,...result}));setMessage(regenerate?"주소를 재발급했습니다.":enabled?"비공개로 전환했습니다.":"공개로 전환했습니다.");}catch(error){setMessage(error instanceof Error?error.message:"설정을 저장하지 못했습니다.");}finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/services/youtube-management" className="text-sm hover:underline">← 유튜브 출연 관리</Link>
      <Button asChild variant="outline"><a href={`/services/course-operations/${initial.course.id}`} target="_blank" rel="noopener noreferrer" aria-label="강의 상세보기 (새 창)">강의 상세보기<ExternalLink /></a></Button>
    </div>
    <h1 className="text-2xl font-semibold">{initial.course.instructor_name} · {initial.course.name}{initial.course.cohort?` · ${initial.course.cohort}`:""}</h1>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="유튜브 관리 항목"><Button role="tab" aria-selected={tab==="schedule"} variant={tab==="schedule"?"default":"outline"} onClick={()=>setTab("schedule")}>출연 및 촬영 일정</Button><Button role="tab" aria-selected={tab==="brief"} variant={tab==="brief"?"default":"outline"} onClick={()=>setTab("brief")}>출연 요청기획서</Button></div>
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="mr-auto text-sm">{enabled?"공개 · 외부 작성 허용":"비공개 · 외부 작성 비활성화"}</span>
      <Button variant="outline" disabled={busy} onClick={()=>void access()}>{enabled?"비공개로 전환":"공개하기"}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>void navigator.clipboard.writeText(new URL(publicPath,window.location.origin).toString()).then(()=>setMessage("주소를 복사했습니다.")).catch(()=>setMessage("주소를 복사하지 못했습니다."))}>주소 복사</Button>
      <Button variant="outline" disabled={busy} onClick={()=>void access(true)}>재발급</Button>
      {enabled&&<Button asChild variant="outline"><a href={publicPath} target="_blank" rel="noopener noreferrer">공개페이지 보기</a></Button>}
    </div>
    <div hidden={tab!=="schedule"}>
      <AppearanceEditor initial={initial.appearances} suggestions={initial.suggestions} landingUtms={initial.landingUtms} onSave={async(row)=>mediaRequest(endpoint,{action:"appearance",id:row.id||undefined,revision:row.revision,appearance:row}) as Promise<Appearance>} onDelete={async(row)=>{await mediaRequest(endpoint,{action:"delete",id:row.id,revision:row.revision});}} onRequest={async(row)=>{if(!settings.public_enabled)throw new Error("출연 및 촬영 일정을 먼저 공개해 주세요.");const url=new URL(`/public/youtube/schedule/${settings.public_token}`,window.location.origin);await navigator.clipboard.writeText(`[${initial.course.instructor_name} · ${initial.course.name} 출연 요청]\n${row.channel_name} 담당자님, 출연 가능 여부와 촬영 일정을 아래 페이지에서 확인해 주세요.\n${url}`);}} />
    </div>
    <div hidden={tab!=="brief"} className="space-y-5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {settings.notion_url&&<Button asChild variant="outline"><a href={settings.notion_url} target="_blank" rel="noopener noreferrer">노션 요청서 열기</a></Button>}
        {settings.notion_public_url&&<Button asChild variant="outline"><a href={settings.notion_public_url} target="_blank" rel="noopener noreferrer">노션 공개페이지</a></Button>}
        <Button disabled={busy} variant="outline" onClick={async()=>{setBusy(true);try{const result=await mediaRequest(`${endpoint}/notion`,{});setSettings(current=>({...current,...result}));setMessage(result.notion_public_url?"노션 공개페이지에 반영했습니다.":"노션에 저장했습니다. 노션의 공유 → 게시에서 공개 여부를 확인해 주세요.");}catch(error){setMessage(error instanceof Error?error.message:"노션에 저장하지 못했습니다.");}finally{setBusy(false);}}}>저장된 요청서 노션 반영</Button>
      </div>
      <BriefEditor initial={initial.settings.brief} revision={initial.settings.brief_revision} onSave={async(brief,revision)=>{const result=await mediaRequest(endpoint,{action:"brief",brief,revision});setSettings(current=>({...current,brief:result.brief,brief_revision:result.brief_revision}));return result.brief_revision;}} />
    </div>
    <MediaNotice message={message} onClose={()=>setMessage("")} />
  </main>;
}
