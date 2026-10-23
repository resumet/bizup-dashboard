"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileAudio,
  FileText,
  Link2,
  Loader2,
  RotateCcw,
  UploadCloud,
  Video,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  formatFileSize,
  type PreparedTranscription,
  validateVideoUpload,
} from "@/lib/tools/video-transcription";

type SourceType = "youtube" | "upload";
type Phase = "idle" | "preparing" | "uploading" | "processing" | "ready";
type StatusResponse = {
  status?: string;
  error?: string;
  detail?: string;
  title?: string;
  transcript?: string;
};

const PHASE_LABELS: Record<Exclude<Phase, "idle" | "ready">, string> = {
  preparing: "안전한 영상 처리 환경을 준비하고 있습니다.",
  uploading: "영상을 업로드하고 있습니다.",
  processing: "음성을 추출하고 대본으로 변환하고 있습니다.",
};

function uploadFile(url: string, file: File, onProgress: (percent: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("영상 업로드에 실패했습니다. 네트워크 연결을 확인해 주세요."));
    request.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    request.onload = () => {
      signal.removeEventListener("abort", abort);
      if (request.status >= 200 && request.status < 300) resolve();
      else {
        try {
          const body = JSON.parse(request.responseText) as { detail?: string };
          reject(new Error(body.detail || "영상 업로드에 실패했습니다."));
        } catch {
          reject(new Error("영상 업로드에 실패했습니다."));
        }
      }
    };
    request.send(file);
  });
}

async function waitForResult(statusUrl: string, signal: AbortSignal, onProcessing: () => void) {
  const deadline = Date.now() + 23 * 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(statusUrl, {
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    const body = (await response.json().catch(() => ({}))) as StatusResponse;
    if (!response.ok) throw new Error(body.detail || "영상 처리 상태를 확인하지 못했습니다.");
    if (body.status === "ready" && body.transcript) return body;
    if (body.status === "error") throw new Error(body.error || "영상 대본을 추출하지 못했습니다.");
    if (!["waiting_upload", "uploading", "processing"].includes(body.status ?? "")) {
      throw new Error("영상 처리 작업이 만료되었습니다. 다시 시도해 주세요.");
    }
    onProcessing();
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      };
      const timer = window.setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, 2000);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  throw new Error("처리 시간이 초과되었습니다. 더 짧은 영상으로 다시 시도해 주세요.");
}

export function VideoTranscriptionTool() {
  const [sourceType, setSourceType] = useState<SourceType>("youtube");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<PreparedTranscription | null>(null);
  const [result, setResult] = useState<{ title: string; transcript: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const busy = !["idle", "ready"].includes(phase);

  useEffect(() => () => abortRef.current?.abort(), []);

  function selectFile(nextFile: File | null) {
    setError("");
    if (!nextFile) {
      setFile(null);
      return;
    }
    try {
      validateVideoUpload({ filename: nextFile.name, size: nextFile.size, contentType: nextFile.type });
      setFile(nextFile);
    } catch (cause) {
      setFile(null);
      setError(cause instanceof Error ? cause.message : "영상 파일을 확인해 주세요.");
    }
  }

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setPrepared(null);
    setResult(null);
    setError("");
    setUploadProgress(0);
    setConsent(false);
  }

  async function start() {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setError("");
    setResult(null);
    setPrepared(null);
    setUploadProgress(0);
    setPhase("preparing");

    try {
      if (sourceType === "youtube" && !url.trim()) throw new Error("유튜브 영상 주소를 입력해 주세요.");
      if (sourceType === "youtube" && !consent) throw new Error("영상 사용 권한을 확인해 주세요.");
      if (sourceType === "upload" && !file) throw new Error("업로드할 영상 파일을 선택해 주세요.");
      if (file) validateVideoUpload({ filename: file.name, size: file.size, contentType: file.type });

      const response = await fetch("/api/tools/video-transcription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sourceType === "youtube"
            ? { type: "youtube", url: url.trim() }
            : {
                type: "upload",
                filename: file!.name,
                size: file!.size,
                contentType: file!.type,
              },
        ),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as PreparedTranscription & { error?: string };
      if (!response.ok || !body.statusUrl || !body.audioUrl || !body.textUrl) {
        throw new Error(body.error || "영상 처리 작업을 시작하지 못했습니다.");
      }
      setPrepared(body);

      if (sourceType === "upload") {
        if (!body.uploadUrl || !file) throw new Error("영상 업로드 주소를 받지 못했습니다.");
        setPhase("uploading");
        await uploadFile(body.uploadUrl, file, setUploadProgress, controller.signal);
      }
      setPhase("processing");
      const completed = await waitForResult(body.statusUrl, controller.signal, () => setPhase("processing"));
      setResult({ title: completed.title || "영상", transcript: completed.transcript || "" });
      setPhase("ready");
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "영상 대본을 추출하지 못했습니다.");
        setPhase("idle");
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <FileText className="size-5" />
            </span>
            영상 대본 추출
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Video />
            <AlertTitle>1회성 영상 처리 도구</AlertTitle>
            <AlertDescription>
              영상에서 음성을 MP3로 추출하고 말한 내용을 TXT 대본으로 변환합니다. 작업 파일과 결과는 별도 내역으로 저장하지 않습니다.
            </AlertDescription>
          </Alert>

          <Tabs
            value={sourceType}
            onValueChange={(value) => {
              if (busy) return;
              setSourceType(value as SourceType);
              setError("");
            }}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="youtube"><Link2 /> 유튜브 주소</TabsTrigger>
              <TabsTrigger value="upload"><UploadCloud /> 영상 업로드</TabsTrigger>
            </TabsList>
            <TabsContent value="youtube" className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="transcription-youtube-url">유튜브 영상 주소</Label>
                <Input
                  id="transcription-youtube-url"
                  type="url"
                  value={url}
                  disabled={busy}
                  placeholder="https://www.youtube.com/watch?v=..."
                  onChange={(event) => setUrl(event.target.value)}
                />
                <p className="text-sm text-muted-foreground">공개된 단일 영상 주소만 사용할 수 있습니다.</p>
              </div>
              <label className="flex items-start gap-3 rounded-lg border p-4 text-sm leading-6">
                <Checkbox
                  checked={consent}
                  disabled={busy}
                  onCheckedChange={(checked) => setConsent(checked === true)}
                  className="mt-1"
                />
                <span>
                  <b>이 영상을 처리할 권한이 있습니다.</b><br />
                  <span className="text-muted-foreground">자신이 제작했거나 제작자가 사용을 허용한 영상에만 사용하세요.</span>
                </span>
              </label>
            </TabsContent>
            <TabsContent value="upload" className="mt-5 space-y-3">
              <Label htmlFor="transcription-video-file">영상 파일</Label>
              <button
                type="button"
                disabled={busy}
                className={cn(
                  "flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition",
                  dragging ? "border-blue-500 bg-blue-50" : "border-border hover:border-blue-400 hover:bg-muted/30",
                  busy && "cursor-not-allowed opacity-60",
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (!busy) selectFile(event.dataTransfer.files[0] ?? null);
                }}
              >
                <span className="grid size-12 place-items-center rounded-full bg-blue-50 text-blue-700"><UploadCloud /></span>
                {file ? (
                  <span><b className="break-all">{file.name}</b><br /><span className="text-sm text-muted-foreground">{formatFileSize(file.size)}</span></span>
                ) : (
                  <span><b>파일을 선택하거나 여기에 놓으세요.</b><br /><span className="text-sm text-muted-foreground">MP4, MOV, M4V, WEBM, MKV, AVI · 최대 500MB</span></span>
                )}
              </button>
              <Input
                ref={fileInputRef}
                id="transcription-video-file"
                type="file"
                className="sr-only"
                accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,.m4v,.mkv"
                disabled={busy}
                onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              />
            </TabsContent>
          </Tabs>

          {error ? <Alert variant="destructive"><AlertTitle>처리할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

          {busy ? (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-5" aria-live="polite">
              <div className="flex items-center gap-3"><Loader2 className="size-5 animate-spin text-blue-600" /><b>{PHASE_LABELS[phase as Exclude<Phase, "idle" | "ready">]}</b></div>
              {phase === "uploading" ? (
                <div className="space-y-2">
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-blue-600 transition-all" style={{ width: `${uploadProgress}%` }} /></div>
                  <p className="text-right text-sm text-muted-foreground">{uploadProgress}%</p>
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">영상 길이에 따라 몇 분 정도 걸릴 수 있습니다. 이 화면을 닫지 마세요.</p>
            </div>
          ) : null}

          {phase !== "ready" ? (
            <Button size="lg" className="w-full" disabled={busy || (sourceType === "youtube" ? !url.trim() || !consent : !file)} onClick={start}>
              {busy ? <Loader2 className="animate-spin" /> : <FileAudio />}
              {busy ? "처리 중" : "음성 추출 및 대본 만들기"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {phase === "ready" && prepared && result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl"><CheckCircle2 className="text-emerald-600" /> 추출 완료</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="transcription-result">{result.title}</Label>
              <Textarea id="transcription-result" readOnly value={result.transcript} className="min-h-72 resize-y leading-7" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button size="lg" asChild><a href={prepared.audioUrl}><Download /> 음성파일 다운로드</a></Button>
              <Button size="lg" variant="outline" asChild><a href={prepared.textUrl}><Download /> 텍스트파일 다운로드</a></Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={reset}><RotateCcw /> 다른 영상 처리하기</Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
