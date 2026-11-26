"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import { formatWebinarCountdownLabel, formatWebinarDate } from "@/lib/course-operations/webinar-proximity";
import { formatDashboardCohort } from "@/lib/dashboard/course-metadata";
import { AppearanceEditor, MediaNotice, mediaRequest } from "./editors";
import type { Appearance, MediaData } from "@/lib/youtube-management/model";
import { formatYoutubeFilmingDeadline, getYoutubeFilmingAlert } from "@/lib/youtube-management/filming-alert";
import { youtubeShortPath } from "@/lib/youtube-management/short-link";
export function YoutubeWorkspace({initial,embedded=false,todayKoreaDate}:{initial:MediaData;embedded?:boolean;todayKoreaDate:string}){
  const [settings,setSettings]=useState(initial.settings);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [appearanceAddRequest,setAppearanceAddRequest]=useState(0);
  const [savedAppearances,setSavedAppearances]=useState(initial.appearances);
  const filmingAlert=settings.appearance_not_required ? null : getYoutubeFilmingAlert(initial.course.free_webinar_at,savedAppearances,todayKoreaDate,initial.filmingAlertWeeks);
  const endpoint=`/api/youtube-management/${initial.course.id}`;
  const enabled=settings.public_enabled;
  const appearanceActionsDisabled = busy || settings.appearance_not_required;
  const token=settings.public_token;
  const shortCode=settings.public_short_code;
  const publicPath=youtubeShortPath("schedule",shortCode)??`/public/youtube/schedule/${token}`;
  const { course } = initial;
  const countdown = formatWebinarCountdownLabel(course.free_webinar_at ?? "", todayKoreaDate);
  async function access(regenerate=false){
    if(regenerate&&!window.confirm("주소를 재발급하면 기존 주소를 사용할 수 없습니다. 재발급하시겠습니까?"))return;
    setBusy(true);try{const result=await mediaRequest(endpoint,{action:"access",kind:"schedule",enabled:regenerate?enabled:!enabled,regenerate});setSettings(current=>({...current,...result}));setMessage(regenerate?"주소를 재발급했습니다.":enabled?"비공개로 전환했습니다.":"공개로 전환했습니다.");}catch(error){setMessage(error instanceof Error?error.message:"설정을 저장하지 못했습니다.");}finally{setBusy(false);}
  }
  async function updateAppearanceRequirement(appearanceNotRequired:boolean){
    setBusy(true);
    try {
      const result = await mediaRequest(endpoint, { action: "appearanceRequirement", appearanceNotRequired });
      setSettings(current => ({ ...current, ...result }));
      toast(appearanceNotRequired ? "유튜브 출연 없이 진행하도록 설정했습니다." : "유튜브 출연 진행 상태로 변경했습니다.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "유튜브 출연 진행 여부를 저장하지 못했습니다.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  return <div className={embedded ? "space-y-6" : "w-full space-y-6 px-5 py-8 lg:px-8"}>
    {!embedded && <Link href="/services/youtube-management" className="text-sm hover:underline">← 강사 출연 유튜브 관리</Link>}
    <header className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">{course.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {[course.instructor_name || "강사 미정", formatDashboardCohort(course.cohort),
            countdown ? formatWebinarDate(course.free_webinar_at) : "웨비나 날짜 미정", countdown].filter(Boolean).join(" | ")}
        </p>
      </div>
      <div role="group" aria-label="강의 및 출연 관리" className="flex items-center gap-1 overflow-x-auto py-1 max-sm:-mx-3 max-sm:[&>*]:px-1 max-sm:[&>*]:text-xs sm:gap-2">
        <Button asChild size="sm" variant="outline"><a href={`/services/course-operations/${course.id}`} target="_blank" rel="noopener noreferrer" aria-label="강의 상세보기 (새 창)">강의 상세보기<ExternalLink className="hidden sm:block" /></a></Button>
        {appearanceActionsDisabled
          ? <Button size="sm" variant="outline" disabled>강사정보 받기</Button>
          : <Button asChild size="sm" variant="outline"><Link href={`/services/instructor-intakes?courseId=${course.id}`}>강사정보 받기</Link></Button>}
        <Button size="sm" disabled={appearanceActionsDisabled} onClick={()=>setAppearanceAddRequest(current=>current+1)}><Plus className="hidden sm:block" />출연 추가</Button>
        <Button size="sm" variant="outline" disabled={appearanceActionsDisabled} onClick={()=>void access()}>{enabled?"비공개로 전환":"공개하기"}</Button>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-sm sm:ml-2">
          <Checkbox checked={settings.appearance_not_required} disabled={busy} onCheckedChange={(checked)=>void updateAppearanceRequirement(checked===true)} />
          유튜브 출연 없이 진행
        </label>
        <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">{enabled?"공개 · 외부 작성 허용":"비공개 · 외부 작성 비활성화"}</span>
      </div>
    </header>
    {filmingAlert&&filmingAlert.alertCount>0?<Alert variant="destructive" className="border-destructive/40 bg-destructive/5 px-4 py-3"><AlertTriangle /><AlertTitle>촬영 일정 미확정 {filmingAlert.alertCount}건</AlertTitle><AlertDescription>무료강의 {initial.filmingAlertWeeks}주 전인 <time dateTime={filmingAlert.deadlineDate??undefined}>{formatYoutubeFilmingDeadline(filmingAlert.deadlineDate)}</time>까지 촬영 일정이 확정되지 않은 출연이 있습니다.</AlertDescription></Alert>:null}
    {enabled && <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={()=>void navigator.clipboard.writeText(new URL(publicPath,window.location.origin).toString()).then(()=>setMessage("주소를 복사했습니다.")).catch(()=>setMessage("주소를 복사하지 못했습니다."))}>주소 복사</Button>
        <Button variant="outline" disabled={busy} onClick={()=>void access(true)}>재발급</Button>
        <Button asChild variant="outline"><a href={publicPath} target="_blank" rel="noopener noreferrer">공개페이지 보기</a></Button>
    </div>}
    <div>
      <AppearanceEditor initial={initial.appearances} suggestions={initial.suggestions} landingUtms={initial.landingUtms} addRequest={appearanceAddRequest} onSave={async(row)=>mediaRequest(endpoint,{action:"appearance",id:row.id||undefined,revision:row.revision,appearance:row}) as Promise<Appearance>} onDelete={async(row)=>{await mediaRequest(endpoint,{action:"delete",id:row.id,revision:row.revision});}} onSaved={(saved)=>setSavedAppearances(current=>current.some(row=>row.id===saved.id)?current.map(row=>row.id===saved.id?saved:row):[...current,saved])} onDeleted={(id)=>setSavedAppearances(current=>current.filter(row=>row.id!==id))} />
    </div>
    <MediaNotice message={message} onClose={()=>setMessage("")} />
  </div>;
}
