"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, LoaderCircle, Play, Plus, RefreshCw, Trash2, TvMinimalPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { inputs, parseSource, errorMessages, type Analysis, type AnalysisRequest, type Batch, type Video } from "@/lib/youtube-analyzer/model";

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
  const [batch,setBatch] = useState<Batch | null>(null);
  const [requests,setRequests] = useState<AnalysisRequest[]>([]);
  const [runs,setRuns] = useState<Analysis[]>([]);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  const [submitting,setSubmitting] = useState(false);
  const [revision,setRevision] = useState(0);
  const [hasMore,setHasMore] = useState(false);
  const [loadingMore,setLoadingMore] = useState(false);
  const viewVersion = useRef(0);
  const [detail,setDetail] = useState<Analysis | null>(null);
  const [videos,setVideos] = useState<Video[] | null>(null);
  const [detailError,setDetailError] = useState("");
  const [deleteTarget,setDeleteTarget] = useState<Analysis | null>(null);
  const [deleting,setDeleting] = useState(false);
  const [deleteError,setDeleteError] = useState("");
  const urls = inputs(text);
  const invalid = urls.flatMap(url => {
    try { parseSource(url); return []; }
    catch (e) { return [{url,message:errorMessages[e instanceof Error ? e.message : ""] ?? errorMessages.INVALID_URL}]; }
  });

  useEffect(() => {
    const read = () => setBatchId(new URLSearchParams(window.location.search).get("batchId"));
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
        setRuns(data.runs);
        setHasMore(!!data.hasMore);
        setBatch(data.batch ?? null);
        setRequests(data.requests ?? []);
        setError("");
        setLoading(false);
        if(active(data.batch)) timer=setTimeout(load,2500);
      } catch(e) {
        if(cancelled) return;
        setError(e instanceof Error ? e.message : "분석 조회 실패");
        setLoading(false);
        if(batchId) timer=setTimeout(load,5000);
      }
    }
    void load();
    return () => {cancelled=true;controller.abort();clearTimeout(timer);};
  },[batchId,revision]);

  useEffect(() => {
    if(!detail) return;
    const controller=new AbortController();
    api(`?channelId=${encodeURIComponent(detail.channel_id)}`,{signal:controller.signal})
      .then(data=>setVideos(data.videos))
      .catch(e=>{if(!controller.signal.aborted) setDetailError(e instanceof Error ? e.message : "영상 조회 실패");});
    return ()=>controller.abort();
  },[detail]);

  function watchBatch(id: string) {
    window.history.pushState(null,"",`?batchId=${id}`);
    setBatchId(id);
    setBatch(null);
    setRequests([]);
  }

  function openAddDialog() {
    if(!active(batch)) {
      window.history.replaceState(null,"",window.location.pathname);
      setBatchId(null);
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

  const completed=requests.filter(request=>["completed","failed"].includes(request.status)).length;

  return <main className="mx-auto min-h-screen max-w-[1600px] space-y-6 px-4 py-6 sm:px-8">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" aria-label="메인 페이지" title="메인 페이지" className="rounded p-2 hover:bg-muted"><ArrowLeft className="size-5" /></Link>
        <TvMinimalPlay className="size-7 shrink-0 text-red-600"/>
        <h1 className="text-2xl font-semibold">유튜브 채널 관리</h1>
      </div>
      <div className="flex items-center gap-2"><Button onClick={openAddDialog}>{active(batch) ? <LoaderCircle className="size-4 animate-spin"/> : <Plus className="size-4"/>}{active(batch) ? "분석 중" : "채널 추가"}</Button><Button variant="outline" size="icon" title="새로고침" aria-label="새로고침" onClick={()=>setRevision(value=>value+1)}><RefreshCw className="size-4"/></Button></div>
    </header>

    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

    <section className="space-y-4 border-t pt-5">
      <div>
        <h2 className="text-lg font-semibold">누적 채널 분석</h2>
        <p className="mt-1 text-sm text-muted-foreground">새 채널은 목록 하단에 추가되고, 기존 채널은 현재 위치에서 최신 정보로 업데이트됩니다.</p>
      </div>
      {loading ? <p className="flex items-center gap-2 py-10 text-sm"><LoaderCircle className="size-4 animate-spin"/>분석 목록을 불러오는 중입니다.</p> : !runs.length ? <p className="border-y py-12 text-center text-muted-foreground">{active(batch) ? "첫 번째 채널 분석을 기다리고 있습니다." : "분석한 채널이 없습니다."}</p> : <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-muted/60"><tr>{["채널 / 주소","전체 / 분석 영상","구독자","최고 조회 영상","최고 조회수","최고 1개 제외 평균","최근 20개 평균","등록 / 업데이트","관리"].map(heading=><th key={heading} className="whitespace-nowrap px-3 py-3 text-left font-medium">{heading}</th>)}</tr></thead>
          <tbody>{runs.map(run=><tr key={run.channel_id} className="border-t align-top hover:bg-muted/20">
            <td className="min-w-60 max-w-72 px-3 py-4"><a href={run.channel.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-semibold hover:underline">{run.channel.thumbnail && <Image unoptimized src={run.channel.thumbnail} alt="" width={36} height={36} className="size-9 rounded-full" referrerPolicy="no-referrer"/>}<span className="break-words">{run.channel.name}</span><ExternalLink className="size-3 shrink-0"/></a><a href={run.channel.url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-muted-foreground hover:underline">{displayUrl(run.channel.url)}</a>{run.warnings.map(warning=><p key={warning} className="mt-2 text-xs text-amber-800">{warning}</p>)}</td>
            <td className="px-3 py-4 tabular-nums">{number(run.channel.reported)} / {number(run.metrics.count)}</td>
            <td className="px-3 py-4 tabular-nums">{run.channel.subscribers===null ? "비공개" : number(run.channel.subscribers)}</td>
            <td className="min-w-52 max-w-64 px-3 py-4">{run.metrics.top ? <a href={`https://www.youtube.com/watch?v=${run.metrics.top.id}`} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{run.metrics.top.title}</a> : "-"}</td>
            {[run.metrics.top?.views,run.metrics.exclude1].map((value,index)=><td key={index} className="px-3 py-4 text-right tabular-nums">{number(value)}</td>)}
            <td className="px-3 py-4 text-right tabular-nums">{number(run.metrics.recent20)}<span className="mt-1 block text-xs text-muted-foreground">{run.metrics.samples[2]}개</span></td>
            <td className="min-w-44 px-3 py-4 text-xs leading-5"><span className="block">등록 {date(run.first_analyzed_at)}</span><span>업데이트 {date(run.last_analyzed_at)}</span></td>
            <td className="px-3 py-4"><div className="flex items-center gap-1"><Button variant="outline" size="sm" onClick={()=>openDetail(run)}>더보기</Button><Button variant="ghost" size="icon-sm" aria-label={`${run.channel.name} 삭제`} title="채널 삭제" disabled={active(batch)} onClick={()=>{setDeleteError("");setDeleteTarget(run);}}><Trash2 className="size-4"/></Button></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {hasMore && <Button variant="outline" disabled={loadingMore} onClick={loadMore}>{loadingMore ? <LoaderCircle className="size-4 animate-spin"/> : null}더 불러오기</Button>}
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
        <DialogHeader><DialogTitle>{detail?.channel.name}</DialogTitle><DialogDescription>최근 영상 {Math.min(detail?.metrics.count ?? 0,30)}개 · {detail ? date(detail.last_analyzed_at) : ""} 기준</DialogDescription></DialogHeader>
        {detailError ? <p role="alert" className="text-red-700">{detailError}</p> : videos===null ? <p>영상을 불러오는 중입니다.</p> : !videos.length ? <p>공개 영상이 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-sm"><thead><tr>{["영상","게시일","조회수","좋아요","댓글"].map(heading=><th key={heading} className="border-b p-2 text-left">{heading}</th>)}</tr></thead><tbody>{videos.map(video=><tr key={video.id}><td className="max-w-96 border-b p-2"><a className="text-blue-700 hover:underline" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer">{video.title}</a></td><td className="whitespace-nowrap border-b p-2">{new Date(video.publishedAt).toLocaleDateString("ko-KR")}</td>{[video.views,video.likes,video.comments].map((value,index)=><td key={index} className="border-b p-2 text-right tabular-nums">{number(value)}</td>)}</tr>)}</tbody></table></div>}
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
