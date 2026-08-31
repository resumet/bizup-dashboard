"use client";

import { useState } from "react";
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

  const downloadUrl = `/api/tools/youtube-download?url=${encodeURIComponent(url)}`;

  return <div className="mx-auto max-w-3xl space-y-6">
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center gap-2"><Badge variant="outline"><CirclePlay /> YOUTUBE</Badge><Badge variant="secondary">공개 영상 전용</Badge></div>
        <CardTitle className="text-2xl">유튜브 영상 다운로드</CardTitle>
        <CardDescription>다운로드 권한이 있는 공개 영상 URL을 넣고 영상 정보를 먼저 확인하세요.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={inspectVideo}>
          <div className="space-y-2"><Label htmlFor="youtube-url">유튜브 URL</Label><div className="flex flex-col gap-2 sm:flex-row"><Input id="youtube-url" type="url" value={url} required placeholder="https://www.youtube.com/watch?v=..." onChange={(event) => { setUrl(event.target.value); setInfo(null); setConsent(false); }} /><Button type="submit" disabled={loading || !url.trim()}>{loading ? <Loader2 className="animate-spin" /> : <Search />} 영상 확인</Button></div></div>
        </form>
      </CardContent>
    </Card>

    {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

    {info ? <Card>
      <CardHeader><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600"><CirclePlay /></span><div className="min-w-0"><CardTitle className="break-words text-xl">{info.title}</CardTitle><CardDescription className="mt-2">{info.channel || "채널 정보 없음"} · {formatDuration(info.duration)}</CardDescription></div></div></CardHeader>
      <CardContent className="space-y-5">
        <label className="flex items-start gap-3 rounded-lg border p-4 text-sm leading-6"><Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} className="mt-1" /><span><b>이 영상을 다운로드할 권한이 있습니다.</b><br /><span className="text-muted-foreground">자신이 제작했거나 제작자가 다운로드를 허용한 공개 영상에만 사용하세요.</span></span></label>
        <Alert><CheckCircle2 /><AlertTitle>다운로드 안내</AlertTitle><AlertDescription>최대 500MB의 영상 1개만 처리합니다. 영상 길이에 따라 다운로드 시작까지 시간이 걸릴 수 있습니다.</AlertDescription></Alert>
        {consent ? <Button size="lg" className="w-full" asChild><a href={downloadUrl}><Download /> 영상 다운로드</a></Button> : <Button size="lg" className="w-full" disabled><Download /> 영상 다운로드</Button>}
      </CardContent>
    </Card> : null}
  </div>;
}
