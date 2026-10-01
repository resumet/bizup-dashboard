"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, ExternalLink, LoaderCircle, Mail, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { ChannelDetailsEditor } from "@/components/youtube-analyzer/channel-details-editor";
import { EmailDraftSettings } from "@/components/youtube-analyzer/email-draft-settings";
import { buildGmailComposeWithAccountChooser } from "@/lib/youtube-analyzer/gmail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CHANNEL_CATEGORIES, DEFAULT_YOUTUBE_EMAIL_SETTINGS, inputs, parseSource, errorMessages, type Analysis, type AnalysisRequest, type Batch, type ChannelCategory, type Video, type YoutubeEmailSettings } from "@/lib/youtube-analyzer/model";
import { sortChannels, type ChannelSort, type SortDirection } from "@/lib/youtube-analyzer/sort";

type CategoryFilter = "all" | "uncategorized" | ChannelCategory;

const number = (n: number | null | undefined) => n == null ? "-" : Math.round(n).toLocaleString("ko-KR");
const date = (s: string) => new Date(s).toLocaleString("ko-KR");
const statuses: Record<string,string> = {
  pending:"대기", running:"분석 중", resolving:"채널 확인 중", fetching_channel:"채널 확인 완료",
  fetching_videos:"영상 수집 중", calculating:"통계 계산 중", saving:"저장 중", completed:"완료",
  partial:"일부 완료", failed:"실패",
};
const active = (batch: Batch | null) => !!batch && ["pending","running"].includes(batch.status);

async function api(path = "", init?: RequestInit) {
  const response = await fetch(`/api/youtube-channels${path}`, {cache:"no-store",...init});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "요청에 실패했습니다.");
  return data;
}

function displayUrl(url: string) {
  try { return decodeURI(url); } catch { return url; }
}

export function YoutubeChannels({ maxUrls = 50 }: { maxUrls?: number }) {
  const [text,setText] = useState("");
  const [addOpen,setAddOpen] = useState(false);
  const [addError,setAddError] = useState("");
  const [batchId,setBatchId] = useState<string | null>(null);
  const [reanalyzeBatch,setReanalyzeBatch] = useState(false);
  const [batch,setBatch] = useState<Batch | null>(null);
  const [requests,setRequests] = useState<AnalysisRequest[]>([]);
  const [runs,setRuns] = useState<Analysis[]>([]);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  const [submitting,setSubmitting] = useState(false);
  const [revision,setRevision] = useState(0);
  const [hasMore,setHasMore] = useState(false);
  const [loadingMore,setLoadingMore] = useState(false);
  const [refreshingEngagement,setRefreshingEngagement] = useState(false);
  const [engagementMessage,setEngagementMessage] = useState("");
  const [engagementError,setEngagementError] = useState("");
  const [reanalyzingAll,setReanalyzingAll] = useState(false);
  const [reanalysisError,setReanalysisError] = useState("");
  const [categoryFilter,setCategoryFilter] = useState<CategoryFilter>("all");
  const [showInvalidChannels,setShowInvalidChannels] = useState(true);
  const [sortBy,setSortBy] = useState<ChannelSort>("position");
  const [sortDirection,setSortDirection] = useState<SortDirection>("desc");
  const [loadingAll,setLoadingAll] = useState(false);
  const [allLoaded,setAllLoaded] = useState(false);
  const [emailSettings,setEmailSettings] = useState<YoutubeEmailSettings>(DEFAULT_YOUTUBE_EMAIL_SETTINGS);
  const viewVersion = useRef(0);
  const [detail,setDetail] = useState<Analysis | null>(null);
  const [videos,setVideos] = useState<Video[] | null>(null);
  const [detailError,setDetailError] = useState("");
  const [deleteTarget,setDeleteTarget] = useState<Analysis | null>(null);
  const [deleting,setDeleting] = useState(false);
  const [deleteError,setDeleteError] = useState("");
  const requiresAll=sortBy!=="position" || categoryFilter!=="all";
  const visibleRuns=useMemo(()=>sortChannels(runs.filter(run=>(showInvalidChannels || !run.excluded_from_updates) && (categoryFilter==="all" || (categoryFilter==="uncategorized" ? run.category===null : run.category===categoryFilter))),sortBy,sortDirection),[runs,showInvalidChannels,categoryFilter,sortBy,sortDirection]);
  const urls = inputs(text);
  const invalid = urls.flatMap(url => {
    try { parseSource(url); return []; }
    catch (e) { return [{url,message:errorMessages[e instanceof Error ? e.message : ""] ?? errorMessages.INVALID_URL}]; }
  });

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      setBatchId(params.get("batchId"));
      setReanalyzeBatch(params.get("reanalyze") === "1");
    };
    read();
    window.addEventListener("popstate",read);
    return () => window.removeEventListener("popstate",read);
  },[]);

  useEffect(() => {
    viewVersion.current++;
    let cancelled=false;
    let timer: ReturnType<typeof setTimeout>;
    const controller=new AbortController();
    async function load() {
      try {
        const data=await api(batchId ? `?batchId=${batchId}` : "",{signal:controller.signal});
        if(cancelled) return;
        const allRuns: Analysis[]=[...data.runs];
        if(requiresAll) {
          let page=data;
          while(page.hasMore) {
            const params=new URLSearchParams({offset:String(allRuns.length)});
            if(batchId) params.set("batchId",batchId);
            page=await api(`?${params}`,{signal:controller.signal});
            if(cancelled) return;
            if(!page.runs.length) throw new Error("전체 채널을 불러오지 못했습니다.");
            allRuns.push(...page.runs);
          }
        }
        setRuns(allRuns);
        setHasMore(!requiresAll && !!data.hasMore);
        setAllLoaded(requiresAll);
        setBatch(data.batch ?? null);
        setRequests(data.requests ?? []);
        setEmailSettings(data.emailSettings ?? DEFAULT_YOUTUBE_EMAIL_SETTINGS);
        setError("");
        setLoading(false);
        setLoadingAll(false);
        if(active(data.batch)) timer=setTimeout(load,2500);
      } catch(e) {
        if(cancelled) return;
        setError(e instanceof Error ? e.message : "분석 조회 실패");
        setLoading(false);
        setLoadingAll(false);
        if(batchId) timer=setTimeout(load,5000);
      }
    }
    void load();
    return () => {cancelled=true;controller.abort();clearTimeout(timer);};
  },[batchId,revision,requiresAll]);

  useEffect(() => {
    if(!detail) return;
    const controller=new AbortController();
    api(`?channelId=${encodeURIComponent(detail.channel_id)}`,{signal:controller.signal})
      .then(data=>setVideos(data.videos))
      .catch(e=>{if(!controller.signal.aborted) setDetailError(e instanceof Error ? e.message : "영상 조회 실패");});
    return ()=>controller.abort();
  },[detail]);

  function watchBatch(id: string, reanalyze = false) {
    window.history.pushState(null,"",`?batchId=${id}${reanalyze ? "&reanalyze=1" : ""}`);
    setBatchId(id);
    setReanalyzeBatch(reanalyze);
    setBatch(null);
    setRequests([]);
  }

  function openAddDialog() {
    if(!batchId || (batch && !active(batch))) {
      window.history.replaceState(null,"",window.location.pathname);
      setBatchId(null);
      setReanalyzeBatch(false);
      setBatch(null);
      setRequests([]);
      setText("");
      setAddError("");
    }
    setAddOpen(true);
  }

  function openDetail(run: Analysis) {
    setVideos(null);
    setDetailError("");
    setDetail(run);
  }

  async function loadMore() {
    const version=viewVersion.current;
    setLoadingMore(true);
    try {
      const params=new URLSearchParams({offset:String(runs.length)});
      if(batchId) params.set("batchId",batchId);
      const data=await api(`?${params}`);
      if(version!==viewVersion.current) return;
      setRuns(previous=>[...new Map([...previous,...data.runs].map((run:Analysis)=>[run.channel_id,run])).values()]);
      setHasMore(!!data.hasMore);
    } catch(e) {
      if(version===viewVersion.current) setError(e instanceof Error ? e.message : "추가 조회 실패");
    } finally { setLoadingMore(false); }
  }

  async function analyze() {
    setSubmitting(true);
    setAddError("");
    try {
      const result=await api("",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({urls:text})});
      watchBatch(result.batchId);
    } catch(e) {
      setAddError(e instanceof Error ? e.message : "분석 요청 실패");
    } finally { setSubmitting(false); }
  }

  async function reanalyzeStoredChannels() {
    setReanalyzingAll(true);
    setReanalysisError("");
    try {
      const result=await api("",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reanalyzeAll:true})});
      watchBatch(result.batchId,true);
    } catch(e) {
      setReanalysisError(e instanceof Error ? e.message : "저장된 채널 재분석을 시작하지 못했습니다.");
    } finally { setReanalyzingAll(false); }
  }

  async function refreshEngagement() {
    setRefreshingEngagement(true);
    setEngagementMessage("");
    setEngagementError("");
    let updatedCount = 0;
    let cursor: string | null = null;
    try {
      do {
        const result = await api("/refresh-engagement",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(cursor ? {cursor} : {}),
        }) as {updatedCount:number;nextCursor:string|null};
        updatedCount += result.updatedCount;
        cursor = result.nextCursor;
        if(cursor) setEngagementMessage(`${number(updatedCount)}개 채널의 최근 30개 평균을 갱신하는 중입니다.`);
      } while(cursor);
      setEngagementMessage(`저장된 영상 데이터로 ${number(updatedCount)}개 채널의 최근 30개 평균 댓글·좋아요를 갱신했습니다.`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "전체 평균을 갱신하지 못했습니다.";
      setEngagementMessage("");
      setEngagementError(updatedCount ? `${message} ${number(updatedCount)}개 채널은 갱신되었습니다. 다시 실행할 수 있습니다.` : message);
    } finally {
      setRevision(value=>value+1);
      setRefreshingEngagement(false);
    }
  }

  async function deleteChannel() {
    if(!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`?channelId=${encodeURIComponent(deleteTarget.channel_id)}`,{method:"DELETE"});
      setRuns(previous=>previous.filter(run=>run.channel_id!==deleteTarget.channel_id));
      if(detail?.channel_id===deleteTarget.channel_id) setDetail(null);
      setDeleteTarget(null);
      setRevision(value=>value+1);
    } catch(e) {
      setDeleteError(e instanceof Error ? e.message : "채널 삭제 실패");
    } finally { setDeleting(false); }
  }

  function updateDetails(channelId: string, details: Pick<Analysis,"email"|"category"|"appearance_fee"|"rs_percent"|"memo"|"excluded_from_updates">) {
    setRuns(previous=>previous.map(run=>run.channel_id===channelId ? {...run,...details} : run));
    setDetail(previous=>previous?.channel_id===channelId ? {...previous,...details} : previous);
  }

  function changeCategoryFilter(next: CategoryFilter) {
    const nextRequiresAll=sortBy!=="position" || next!=="all";
    if(nextRequiresAll!==requiresAll) {
      setLoadingAll(nextRequiresAll);
      if(!nextRequiresAll) setLoading(true);
    }
    setCategoryFilter(next);
  }

  function changeSort(next: ChannelSort) {
    const nextRequiresAll=next!=="position" || categoryFilter!=="all";
    if(nextRequiresAll!==requiresAll) {
      setLoadingAll(nextRequiresAll);
      if(!nextRequiresAll) setLoading(true);
    }
    setSortDirection("desc");
    setSortBy(next);
  }

  const completed=requests.filter(request=>["completed","failed"].includes(request.status)).length;
  const analysisPending=!!batchId && (!batch || active(batch));

  return <main className="mx-auto min-h-screen max-w-[1900px] space-y-6 px-4 py-6 sm:px-8">
    <div className="flex flex-wrap items-center justify-end gap-4 pb-5">
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={reanalyzingAll || refreshingEngagement || submitting || analysisPending || loading || !runs.length} onClick={()=>void reanalyzeStoredChannels()} title="저장된 모든 채널을 다시 분석해 숏츠 제외 기준을 적용합니다.">{reanalyzingAll ? <LoaderCircle className="size-4 animate-spin"/> : <RefreshCw className="size-4"/>}숏츠 제외 재분석</Button><Button variant="outline" disabled={refreshingEngagement || reanalyzingAll || analysisPending} onClick={()=>void refreshEngagement()} title="저장된 영상 데이터로 모든 채널의 평균 댓글·좋아요를 다시 계산합니다.">{refreshingEngagement ? <LoaderCircle className="size-4 animate-spin"/> : <RefreshCw className="size-4"/>}전체 평균 갱신 (임시)</Button><EmailDraftSettings settings={emailSettings} onSaved={setEmailSettings}/><Button onClick={openAddDialog}>{analysisPending ? <LoaderCircle className="size-4 animate-spin"/> : <Plus className="size-4"/>}{analysisPending ? "분석 중" : "채널 추가"}</Button><Button variant="outline" size="icon" title="새로고침" aria-label="새로고침" onClick={()=>setRevision(value=>value+1)}><RefreshCw className="size-4"/></Button></div>
    </div>

    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {reanalysisError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{reanalysisError}</p>}
    {reanalyzeBatch && batchId && <p role="status" className="rounded-md border bg-muted/30 p-3 text-sm">{batch ? <>저장된 채널 재분석: {statuses[batch.status] ?? batch.status} · 처리 {completed} / {batch.input_count}개{batch.status==="completed" ? " · 숏츠 제외 기준 적용 완료" : ""}</> : "저장된 채널 재분석 요청을 확인하는 중입니다."}</p>}
    {engagementError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{engagementError}</p>}
    {engagementMessage && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{engagementMessage}</p>}

    <section className="space-y-4 border-t pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">누적 채널 분석</h2>
          <p className="mt-1 text-sm text-muted-foreground">새 분석에서는 숏츠를 제외합니다. 기존 채널에도 적용하려면 상단의 숏츠 제외 재분석을 실행하세요.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" aria-pressed={!showInvalidChannels} onClick={()=>setShowInvalidChannels(show=>!show)}>
            {showInvalidChannels ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {showInvalidChannels ? "유효하지 않은 채널 숨기기" : "유효하지 않은 채널 보기"}
          </Button>
          <label htmlFor="youtube-channel-category-filter" className="text-sm font-medium">분류</label>
          <select id="youtube-channel-category-filter" className="h-9 max-w-56 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={categoryFilter} onChange={event=>changeCategoryFilter(event.target.value as CategoryFilter)}>
            <option value="all">전체 분류</option>
            {CHANNEL_CATEGORIES.map(category=><option key={category} value={category}>{category}</option>)}
            <option value="uncategorized">미분류</option>
          </select>
          <label htmlFor="youtube-channel-sort" className="text-sm font-medium">정렬</label>
          <select id="youtube-channel-sort" className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={sortBy} onChange={event=>changeSort(event.target.value as ChannelSort)}>
            <option value="position">등록 순서</option>
            <option value="subscribers">구독자 수</option>
            <option value="topViews">최고 조회수</option>
            <option value="exclude1">최고 1개 제외 평균</option>
            <option value="recent20">최근 20개 평균</option>
            <option value="recent30Comments">최근 30개 평균 댓글</option>
            <option value="recent30Likes">최근 30개 평균 좋아요</option>
          </select>
          {sortBy!=="position" && <select aria-label="정렬 방향" className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={sortDirection} onChange={event=>setSortDirection(event.target.value as SortDirection)}>
            <option value="desc">높은 순</option>
            <option value="asc">낮은 순</option>
          </select>}
        </div>
      </div>
      {loading || loadingAll ? <p role="status" className="flex items-center gap-2 py-10 text-sm"><LoaderCircle className="size-4 animate-spin"/>{loadingAll ? "전체 채널을 불러오는 중입니다." : "분석 목록을 불러오는 중입니다."}</p> : requiresAll && !allLoaded ? <div className="flex items-center gap-3 border-y py-8 text-sm"><span>전체 채널을 불러오지 못했습니다.</span><Button variant="outline" size="sm" onClick={()=>{setLoadingAll(true);setRevision(value=>value+1);}}>다시 시도</Button></div> : !runs.length ? <p className="border-y py-12 text-center text-muted-foreground">{active(batch) ? "첫 번째 채널 분석을 기다리고 있습니다." : "분석한 채널이 없습니다."}</p> : !visibleRuns.length ? <p className="border-y py-12 text-center text-muted-foreground">선택한 필터에 해당하는 채널이 없습니다.</p> : <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1550px] text-sm">
          <thead className="bg-muted/60"><tr>{["채널 / 주소","이메일","출연료","RS(%)","전체 / 분석 영상","구독자","최근 20개 평균","최근 30개 평균 댓글","최근 30개 평균 좋아요","등록 / 업데이트","관리"].map(heading=><th key={heading} className="whitespace-nowrap px-3 py-3 text-left font-medium">{heading}</th>)}</tr></thead>
          <tbody>{visibleRuns.map(run=><tr key={run.channel_id} className={`border-t align-top transition-colors ${run.excluded_from_updates ? "bg-muted/70 text-muted-foreground hover:bg-muted/80" : "hover:bg-muted/20"}`}>
            <td className="min-w-60 max-w-72 px-3 py-4"><a href={run.channel.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-semibold hover:underline">{run.channel.thumbnail && <Image unoptimized src={run.channel.thumbnail} alt="" width={36} height={36} className={`size-9 rounded-full ${run.excluded_from_updates ? "grayscale opacity-60" : ""}`} referrerPolicy="no-referrer"/>}<span className="break-words">{run.channel.name}</span><ExternalLink className="size-3 shrink-0"/></a><a href={run.channel.url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-muted-foreground hover:underline">{displayUrl(run.channel.url)}</a><p className="mt-3 text-xs text-muted-foreground">분류: <span className={run.excluded_from_updates ? "font-medium" : "font-medium text-foreground"}>{run.category ?? "-"}</span></p>{run.excluded_from_updates ? <p className="mt-2 inline-flex rounded-full border bg-background/70 px-2 py-1 text-xs font-medium">유효하지 않은 채널 · 업데이트 제외</p> : null}<div className="mt-2"><ChannelDetailsEditor run={run} onSaved={updateDetails}/></div>{run.warnings.map(warning=><p key={warning} className="mt-2 text-xs text-amber-800">{warning}</p>)}</td>
            <td className="min-w-52 px-3 py-4">{run.email ? <a href={buildGmailComposeWithAccountChooser(run.email,{body:emailSettings.email_body,signatureMode:emailSettings.signature_mode,customSignature:emailSettings.custom_signature})} target="_blank" rel="noreferrer" title="저장한 본문으로 Google 계정을 선택해 Gmail 작성창 열기" className="flex items-start gap-1.5 break-all text-sm text-primary hover:underline"><Mail className="mt-0.5 size-3.5 shrink-0" />{run.email}</a> : null}</td>
            <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{run.appearance_fee == null ? "-" : `${number(run.appearance_fee)}원`}</td>
            <td className="whitespace-nowrap px-3 py-4 text-right tabular-nums">{run.rs_percent == null ? "-" : `${run.rs_percent}%`}</td>
            <td className="px-3 py-4 tabular-nums">{number(run.channel.reported)} / {number(run.metrics.count)}</td>
            <td className="px-3 py-4 tabular-nums">{run.channel.subscribers===null ? "비공개" : number(run.channel.subscribers)}</td>
            <td className="px-3 py-4 text-right tabular-nums">{number(run.metrics.recent20)}<span className="mt-1 block text-xs text-muted-foreground">{run.metrics.samples[2]}개</span></td>
            <td className="px-3 py-4 text-right tabular-nums">{number(run.metrics.recent30Comments)}</td>
            <td className="px-3 py-4 text-right tabular-nums">{number(run.metrics.recent30Likes)}</td>
            <td className="min-w-44 px-3 py-4 text-xs leading-5"><span className="block">등록 {date(run.first_analyzed_at)}</span><span>업데이트 {date(run.last_analyzed_at)}</span></td>
            <td className="px-3 py-4"><div className="flex items-center gap-1"><Button variant="outline" size="sm" onClick={()=>openDetail(run)}>더보기</Button><Button variant="ghost" size="icon-sm" aria-label={`${run.channel.name} 삭제`} title="채널 삭제" disabled={active(batch)} onClick={()=>{setDeleteError("");setDeleteTarget(run);}}><Trash2 className="size-4"/></Button></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {!requiresAll && hasMore && <Button variant="outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? <LoaderCircle className="size-4 animate-spin"/> : null}더 불러오기</Button>}
    </section>

    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>채널 추가</DialogTitle><DialogDescription>YouTube 채널 또는 영상 URL을 입력하면 분석 후 누적 목록 하단에 추가됩니다. 이미 등록된 채널은 기존 위치에서 업데이트됩니다.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3"><label htmlFor="youtube-urls" className="font-semibold">분석할 YouTube URL</label><span className={urls.length>maxUrls ? "text-sm text-red-700" : "text-sm text-muted-foreground"}>{urls.length} / {maxUrls}</span></div>
          <textarea id="youtube-urls" value={text} onChange={event=>setText(event.target.value)} rows={6} maxLength={100000} disabled={!!batchId} placeholder={"https://www.youtube.com/@채널이름\nhttps://www.youtube.com/watch?v=xxxxxxxxxxx"} className="w-full resize-y rounded-md border bg-background p-3 text-sm leading-6 focus:outline-2 focus:outline-red-500 disabled:opacity-60" />
          {invalid.length>0 && <ul className="space-y-1 text-sm text-amber-800">{invalid.slice(0,5).map(({url,message})=><li key={url} className="break-all">{url}: {message}</li>)}{invalid.length>5 && <li>외 {invalid.length-5}개</li>}</ul>}
          {addError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{addError}</p>}
          {batch && <div className="space-y-2 rounded-md bg-muted/40 p-3 text-sm" aria-live="polite"><div className="flex flex-wrap gap-x-5 gap-y-2"><strong>{statuses[batch.status]}</strong><span>입력 {batch.input_count}개</span><span>고유 채널 {batch.unique_channel_count}개</span><span>처리 {completed} / {batch.input_count}</span>{batch.completed_at && <span>완료 {date(batch.completed_at)}</span>}</div><progress aria-label="분석 진행률" value={completed} max={batch.input_count} className="h-2 w-full accent-red-600"/></div>}
          {requests.length>0 && <details open className="text-sm"><summary className="cursor-pointer py-2">URL별 처리 상태 ({requests.length})</summary><ul className="max-h-48 space-y-2 overflow-auto py-2">{requests.map(request=><li key={request.id} className="flex flex-wrap gap-2 border-b pb-2"><span className="min-w-0 flex-1 break-all">{displayUrl(request.input_url)}</span><span className={request.status==="failed" ? "text-red-700" : "text-emerald-700"}>{statuses[request.status]}</span>{request.error_code && <p className="w-full text-red-700">{errorMessages[request.error_code] ?? "분석에 실패했습니다."}</p>}</li>)}</ul></details>}
        </div>
        <DialogFooter><DialogClose asChild><Button variant="outline">닫기</Button></DialogClose><Button onClick={analyze} disabled={submitting || !!batchId || !urls.length || urls.length>maxUrls}>{submitting ? <LoaderCircle className="size-4 animate-spin"/> : <Play className="size-4"/>}분석 시작</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!detail} onOpenChange={open=>{if(!open) setDetail(null);}}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>{detail?.channel.name}</DialogTitle><DialogDescription>최근 분석 영상 {Math.min(detail?.metrics.count ?? 0,30)}개 · {detail ? date(detail.last_analyzed_at) : ""} 기준</DialogDescription></DialogHeader>
        {detail && <section aria-label="최고 조회 영상 요약" className="grid gap-3 sm:grid-cols-3">
          <div className="min-w-0 rounded-lg border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">최고 조회 영상</p>{detail.metrics.top ? <a href={`https://www.youtube.com/watch?v=${detail.metrics.top.id}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-start gap-1.5 break-words font-medium text-blue-700 hover:underline">{detail.metrics.top.title}<ExternalLink className="mt-0.5 size-3.5 shrink-0" /></a> : <p className="mt-2 font-medium">-</p>}</div>
          <div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">최고 조회수</p><p className="mt-2 text-xl font-semibold tabular-nums">{number(detail.metrics.top?.views)}</p></div>
          <div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">최고 1개 제외 평균 조회수</p><p className="mt-2 text-xl font-semibold tabular-nums">{number(detail.metrics.exclude1)}</p></div>
        </section>}
        {detail?.memo ? <section aria-label="채널 메모" className="rounded-lg border bg-muted/20 p-4"><p className="text-xs text-muted-foreground">메모</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{detail.memo}</p></section> : null}
        {detailError ? <p role="alert" className="text-red-700">{detailError}</p> : videos===null ? <p>영상을 불러오는 중입니다.</p> : !videos.length ? <p>분석된 공개 영상이 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-sm"><thead><tr>{["영상","게시일","조회수","좋아요","댓글"].map(heading=><th key={heading} className="border-b p-2 text-left">{heading}</th>)}</tr></thead><tbody>{videos.map(video=><tr key={video.id}><td className="max-w-96 border-b p-2"><a className="text-blue-700 hover:underline" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">{video.title}</a></td><td className="whitespace-nowrap border-b p-2">{new Date(video.publishedAt).toLocaleDateString("ko-KR")}</td>{[video.views,video.likes,video.comments].map((value,index)=><td key={index} className="border-b p-2 text-right tabular-nums">{number(value)}</td>)}</tr>)}</tbody></table></div>}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleteTarget} onOpenChange={open=>{if(!open && !deleting){setDeleteTarget(null);setDeleteError("");}}}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>채널을 삭제할까요?</AlertDialogTitle>
          <AlertDialogDescription><strong>{deleteTarget?.channel.name}</strong>의 분석 정보와 저장된 영상이 누적 목록에서 삭제됩니다. 같은 채널을 다시 분석하면 목록 하단에 새로 추가됩니다.</AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && <p role="alert" className="text-sm text-red-700">{deleteError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={deleting} onClick={event=>{event.preventDefault();void deleteChannel();}}>{deleting ? <LoaderCircle className="size-4 animate-spin"/> : <Trash2 className="size-4"/>}{deleting ? "삭제 중…" : "삭제"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}
