"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CirclePlay, Download, Loader2, Search } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDuration } from "@/lib/tools/youtube-download";

type VideoInfo = { id: string; title: string; channel: string; duration: number; thumbnail: string };

export function YoutubeDownloader() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState("");
  const downloadAbort = useRef<AbortController | null>(null);
  useEffect(() => () => { downloadAbort.current?.abort(); }, []);

  async function inspectVideo(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setInfo(null);
    try {
      const response = await fetch("/api/tools/youtube-download/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await response.json() as { info?: VideoInfo; error?: string };
      if (!response.ok || !body.info) throw new Error(body.error || "영상 정보를 확인하지 못했습니다.");
      setInfo(body.info);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "영상 정보를 확인하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function startDownload() {
    downloadAbort.current?.abort();
    const controller = new AbortController();
    downloadAbort.current = controller;
    setDownloading(true);
    setError("");
    setDownloadMessage("다운로드 환경을 준비하고 있습니다.");
    try {
      const response = await fetch("/api/tools/youtube-download", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }), signal: controller.signal,
      });
      const body = await response.json() as { downloadUrl?: string; statusUrl?: string; error?: string };
      if (!response.ok || !body.downloadUrl) throw new Error(body.error || "다운로드를 준비하지 못했습니다.");
      if (body.statusUrl) {
        setDownloadMessage("영상을 내려받고 있습니다. 준비가 끝나면 파일 저장이 시작됩니다.");
        const deadline = Date.now() + 15 * 60_000;
        while (true) {
          if (Date.now() >= deadline) throw new Error("영상 처리 시간이 초과되었습니다. 더 짧은 영상으로 다시 시도해 주세요.");
          const statusResponse = await fetch(body.statusUrl, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
          const status = await statusResponse.json() as { status?: string; error?: string; detail?: string };
          if (!statusResponse.ok) throw new Error(status.detail || "다운로드 상태를 확인하지 못했습니다.");
          if (status.status === "ready") break;
          if (status.status !== "processing") throw new Error(status.error || "다운로드 주소가 만료되었습니다. 다시 시도해 주세요.");
          await new Promise<void>((resolve, reject) => {
            const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
            const timer = setTimeout(() => { controller.signal.removeEventListener("abort", abort); resolve(); }, 2000);
            controller.signal.addEventListener("abort", abort, { once: true });
          });
        }
      }
      window.location.assign(body.downloadUrl);
      setDownloadMessage("파일 저장을 시작했습니다.");
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "다운로드에 실패했습니다.");
        setDownloadMessage("");
      }
    } finally {
      if (downloadAbort.current === controller) setDownloading(false);
    }
  }

  return <div className="mx-auto max-w-3xl space-y-6">
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center gap-2"><Badge variant="outline"><CirclePlay /> YOUTUBE</Badge><Badge variant="secondary">공개 영상 전용</Badge></div>
        <CardTitle className="text-2xl">유튜브 영상 다운로드</CardTitle>
        <CardDescription>다운로드 권한이 있는 공개 영상 URL을 넣고 영상 정보를 먼저 확인하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={inspectVideo}>
          <div className="space-y-2"><Label htmlFor="youtube-url">유튜브 URL</Label><div className="flex flex-col gap-2 sm:flex-row"><Input id="youtube-url" type="url" value={url} required disabled={loading || downloading} placeholder="https://www.youtube.com/watch?v=..." onChange={(event) => { setUrl(event.target.value); setInfo(null); setConsent(false); setDownloadMessage(""); }} /><Button type="submit" disabled={loading || downloading || !url.trim()}>{loading ? <Loader2 className="animate-spin" /> : <Search />} 영상 확인</Button></div></div>
        </form>
      </CardContent>
    </Card>

    {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

    {info ? <Card>
      <CardHeader><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600"><CirclePlay /></span><div className="min-w-0"><CardTitle className="break-words text-xl">{info.title}</CardTitle><CardDescription className="mt-2">{info.channel || "채널 정보 없음"} · {formatDuration(info.duration)}</CardDescription></div></div></CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-start gap-3 rounded-lg border p-4 text-sm leading-6"><Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} className="mt-1" /><span><b>이 영상을 다운로드할 권한이 있습니다.</b><br /><span className="text-muted-foreground">자신이 제작했거나 제작자가 다운로드를 허용한 공개 영상에만 사용하세요.</span></span></label>
        <Alert><CheckCircle2 /><AlertTitle>다운로드 안내</AlertTitle><AlertDescription>최대 500MB의 영상 1개만 처리합니다. 영상 길이에 따라 다운로드 시작까지 시간이 걸릴 수 있습니다.</AlertDescription></Alert>
        <Button size="lg" className="w-full" disabled={!consent || downloading} onClick={startDownload}>{downloading ? <Loader2 className="animate-spin" /> : <Download />}{downloading ? "다운로드 준비 중" : "영상 다운로드"}</Button>
        {downloadMessage ? <p role="status" className="text-sm text-muted-foreground">{downloadMessage}</p> : null}
      </CardContent>
    </Card> : null}
  </div>;
}
