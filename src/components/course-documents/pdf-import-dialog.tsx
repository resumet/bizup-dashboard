"use client";

import { useEffect, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentRenderer } from "./document-renderer";
import { pdfNodes, validatePdfFile, type PdfImport, type PdfResult } from "@/lib/course-documents/pdf";
import type { RichTextNode } from "@/lib/course-documents/types";

type Props = {
  documentId: string; accessToken?: string; onInsert: (nodes: RichTextNode[]) => void;
};
type ApiBody = { message?: string; imports?: PdfImport[]; id?: string; uploadUrl?: string };

export function PdfImportDialog({ documentId, accessToken, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [currentId, setCurrentId] = useState("");
  const [job, setJob] = useState<PdfImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadStage, setUploadStage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [refresh, setRefresh] = useState(0);
  const result = job?.result;
  const pageImageResult = result?.version === 2 ? result : null;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(accessToken ? { "x-course-access-token": accessToken } : {}) };

  useEffect(() => {
    if (!open || !currentId) return;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    async function load() {
      let pollAgain = false;
      try {
        const response = await fetch(`/api/course-document-pdfs?documentId=${documentId}&selectedId=${currentId}`, {
          headers: accessToken ? { "x-course-access-token": accessToken } : {}, cache: "no-store", signal: controller.signal,
        });
        const body = await response.json() as ApiBody;
        if (!response.ok) throw new Error(body.message ?? "PDF 페이지 이미지 상태를 불러오지 못했습니다.");
        const current = body.imports?.[0] ?? null;
        if (!controller.signal.aborted) setJob(current);
        pollAgain = Boolean(current && ["queued", "processing"].includes(current.status));
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "상태 조회 실패");
      } finally {
        if (!controller.signal.aborted && pollAgain) timeout = setTimeout(load, 3000);
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [open, documentId, accessToken, currentId, refresh]);

  function chooseFile(nextFile: File | null) {
    setFile(nextFile); setCurrentId(""); setJob(null); setError(""); setNotice("");
  }

  async function queue(id: string) {
    const response = await fetch("/api/course-document-pdfs", { method: "PATCH", headers, body: JSON.stringify({ documentId, id, action: "queue" }) });
    const body = await response.json() as ApiBody;
    if (!response.ok) throw new Error(body.message ?? "페이지 이미지 생성을 시작하지 못했습니다.");
  }

  async function upload() {
    if (!file || busy) return;
    setBusy(true); setError(""); setNotice("");
    let createdId = "";
    try {
      validatePdfFile(file);
      setUploadStage("파일 확인");
      const bytes = await file.arrayBuffer();
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("PDF 형식이 올바르지 않습니다.");
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (n) => n.toString(16).padStart(2, "0")).join("");
      const response = await fetch("/api/course-document-pdfs", { method: "POST", headers, body: JSON.stringify({
        documentId, fileName: file.name, fileSize: file.size, mime: file.type, sha256: hash,
        options: { output: "page_images" },
      }) });
      const body = await response.json() as ApiBody;
      if (!response.ok || !body.id || !body.uploadUrl) throw new Error(body.message ?? "업로드를 준비하지 못했습니다.");
      createdId = body.id;
      setCurrentId(body.id);
      setUploadStage("업로드");
      const uploaded = await fetch(body.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file });
      if (!uploaded.ok) throw new Error("PDF 업로드에 실패했습니다. 다시 시도해 주세요.");
      await queue(body.id);
      setRefresh((value) => value + 1); setFile(null);
      setNotice("페이지 이미지를 만들고 있습니다. 변환에 사용된 원본 PDF는 즉시 삭제됩니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF 업로드 실패");
      if (createdId) { setCurrentId(createdId); setRefresh((value) => value + 1); }
    } finally { setBusy(false); setUploadStage(""); }
  }

  function insert(value: PdfResult) {
    try {
      if (!job || value.version !== 2 || value.blocks.some((block) => block.node.type !== "image" || block.source.method !== "render")) {
        throw new Error("페이지 이미지 결과가 올바르지 않습니다. PDF를 다시 업로드해 주세요.");
      }
      onInsert(pdfNodes(value, job.id)); setCurrentId(""); setJob(null); setNotice(""); setOpen(false);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "본문에 넣지 못했습니다."); }
  }

  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><FileUp />PDF 업로드</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-[1200px] flex-col overflow-hidden sm:max-w-[1200px]" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>PDF 페이지 이미지 업로드</DialogTitle></DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => { event.preventDefault(); void upload(); }}
            onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy) chooseFile(event.dataTransfer.files[0] ?? null); }}>
            <Label htmlFor="pdf-file">PDF 파일</Label>
            <Input id="pdf-file" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => {
              chooseFile(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }} />
            <p className="text-xs text-muted-foreground">각 페이지를 가로폭 1,600px 이미지 한 장으로 만듭니다. 변환에 사용된 원본 PDF는 즉시 삭제됩니다. 최대 50MB·100페이지입니다.</p>
            {file ? <p className="break-all text-sm">{file.name}</p> : null}
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" disabled={!file || busy}>{busy ? <Loader2 className="animate-spin" /> : <FileUp />}{uploadStage || "페이지 이미지 만들기"}</Button>
            </div>
          </form>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p role="status" className="text-sm">{notice}</p> : null}
          {job ? <div className="space-y-3">
            <div role="status" className="flex flex-wrap items-center gap-3 text-sm"><span>{job.stage} · {job.progress}%</span>
              <progress max={100} value={job.progress} aria-label="PDF 페이지 이미지 생성 진행률" className="h-2 w-48" />
              {job.status === "failed" ? <span className="text-destructive">{job.error_message || "처리하지 못했습니다. PDF를 다시 업로드해 주세요."}</span> : null}
              {job.status === "uploaded" ? <Button size="sm" disabled={busy} onClick={() => void queue(job.id).then(() => setRefresh((value) => value + 1)).catch((caught) => setError(caught instanceof Error ? caught.message : "요청 실패"))}>페이지 이미지 만들기</Button> : null}
              {pageImageResult ? <Button size="sm" onClick={() => insert(pageImageResult)}>본문 끝에 추가</Button> : null}
            </div>
            {job.status === "queued" ? <p className="text-sm text-muted-foreground">페이지 이미지 생성을 기다리고 있습니다.</p> : null}
            {pageImageResult ? <div className="max-h-[65dvh] min-w-0 space-y-4 overflow-y-auto rounded-lg border p-4">
              {pageImageResult.blocks.map((block) => <div key={block.id} className="space-y-2 border-b pb-4 last:border-b-0">
                <p className="text-xs font-medium">{block.source.page}페이지</p>
                <DocumentRenderer blocks={[{ id: block.id, type: "rich_text", content: block.node }]} />
              </div>)}
            </div> : null}
          </div> : null}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
