"use client";

import { useEffect, useState } from "react";
import { FileUp, Loader2, RefreshCw } from "lucide-react";
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
type ApiBody = { message?: string; imports?: PdfImport[]; id?: string; uploadUrl?: string; url?: string; duplicate?: PdfImport };

export function PdfImportDialog({ documentId, accessToken, onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<PdfImport[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadStage, setUploadStage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [duplicate, setDuplicate] = useState<PdfImport | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourcePage, setSourcePage] = useState(1);
  const [mobilePanel, setMobilePanel] = useState("content");
  const [refresh, setRefresh] = useState(0);
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];
  const result = selected?.result;
  const pageImageResult = result?.version === 2 ? result : null;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(accessToken ? { "x-course-access-token": accessToken } : {}) };

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    async function load() {
      let pollAgain = true;
      try {
        const response = await fetch(`/api/course-document-pdfs?documentId=${documentId}&selectedId=${selectedId}`, {
          headers: accessToken ? { "x-course-access-token": accessToken } : {}, cache: "no-store", signal: controller.signal,
        });
        const body = await response.json() as ApiBody;
        if (!response.ok) throw new Error(body.message ?? "PDF 페이지 이미지 상태를 불러오지 못했습니다.");
        if (!controller.signal.aborted) setJobs(body.imports ?? []);
        pollAgain = Boolean(body.imports?.some((job) => ["queued", "processing"].includes(job.status)));
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "상태 조회 실패");
      } finally {
        if (!controller.signal.aborted && pollAgain) timeout = setTimeout(load, 3000);
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [open, documentId, accessToken, selectedId, refresh]);

  function selectJob(id: string) {
    setSelectedId(id); setSourceUrl(""); setSourcePage(1);
  }

  async function patch(id: string, action: string) {
    const response = await fetch("/api/course-document-pdfs", { method: "PATCH", headers, body: JSON.stringify({ documentId, id, action }) });
    const body = await response.json() as ApiBody;
    if (!response.ok) throw new Error(body.message ?? "PDF 요청을 처리하지 못했습니다.");
    return body;
  }

  async function upload(allowDuplicate = false) {
    if (!file || busy) return;
    setBusy(true); setError(""); setNotice(""); setDuplicate(null);
    let createdId = "";
    try {
      validatePdfFile(file);
      setUploadStage("파일 확인");
      const bytes = await file.arrayBuffer();
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("PDF 형식이 올바르지 않습니다.");
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (n) => n.toString(16).padStart(2, "0")).join("");
      const response = await fetch("/api/course-document-pdfs", { method: "POST", headers, body: JSON.stringify({
        documentId, fileName: file.name, fileSize: file.size, mime: file.type, sha256: hash,
        options: { output: "page_images" }, allowDuplicate,
      }) });
      const body = await response.json() as ApiBody;
      if (response.status === 409 && body.duplicate) { setDuplicate(body.duplicate); return; }
      if (!response.ok || !body.id || !body.uploadUrl) throw new Error(body.message ?? "업로드를 준비하지 못했습니다.");
      createdId = body.id;
      setUploadStage("업로드");
      const uploaded = await fetch(body.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: file });
      if (!uploaded.ok) throw new Error("PDF 업로드에 실패했습니다. 다시 시도해 주세요.");
      await patch(body.id, "queue");
      selectJob(body.id); setRefresh((value) => value + 1); setFile(null);
      setNotice("업로드했습니다. 창을 닫아도 페이지 이미지 생성은 계속되며, PDF 업로드에서 결과를 다시 확인할 수 있습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF 업로드 실패");
      if (createdId) { selectJob(createdId); setRefresh((value) => value + 1); }
    } finally { setBusy(false); setUploadStage(""); }
  }

  async function action(actionName: string) {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const body = await patch(selected.id, actionName);
      if (body.url) setSourceUrl(body.url);
      else setRefresh((value) => value + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "요청 실패"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!selected || busy || !window.confirm("이 PDF의 원본과 페이지 이미지를 삭제할까요? 본문에서 사용 중인 PDF는 삭제할 수 없습니다.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/course-document-pdfs", { method: "DELETE", headers, body: JSON.stringify({ documentId, id: selected.id }) });
      const body = await response.json() as ApiBody;
      if (!response.ok) throw new Error(body.message ?? "PDF를 삭제하지 못했습니다.");
      setJobs((current) => current.filter((job) => job.id !== selected.id));
      selectJob(""); setRefresh((value) => value + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "PDF 삭제 실패"); }
    finally { setBusy(false); }
  }

  function insert(value: PdfResult) {
    try {
      if (value.version !== 2 || value.blocks.some((block) => block.node.type !== "image" || block.source.method !== "render")) {
        throw new Error("이전 텍스트 변환 결과는 추가할 수 없습니다. PDF를 다시 업로드해 주세요.");
      }
      onInsert(pdfNodes(value, selected!.id)); setOpen(false);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "본문에 넣지 못했습니다."); }
  }

  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><FileUp />PDF 업로드</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent className="flex max-h-[94dvh] w-[calc(100%-1rem)] max-w-[1600px] flex-col overflow-hidden sm:max-w-[1600px]" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>PDF 페이지 이미지 업로드</DialogTitle></DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <form className="space-y-3 rounded-lg border p-4" onSubmit={(event) => { event.preventDefault(); void upload(); }}
            onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy) { setFile(event.dataTransfer.files[0] ?? null); setDuplicate(null); } }}>
            <Label htmlFor="pdf-file">PDF 파일</Label>
            <Input id="pdf-file" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setDuplicate(null); }} />
            <p className="text-xs text-muted-foreground">각 페이지를 이미지 한 장으로 만들어 순서대로 업로드합니다. 최대 50MB·100페이지, 암호를 해제한 PDF를 사용해 주세요.</p>
            {file ? <p className="break-all text-sm">{file.name}</p> : null}
            <div className="flex flex-wrap items-center gap-4">
              <Button type="submit" disabled={!file || busy}>{busy ? <Loader2 className="animate-spin" /> : <FileUp />}{uploadStage || "페이지 이미지 만들기"}</Button>
            </div>
            {duplicate ? <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted p-3 text-sm"><span>같은 PDF의 페이지 이미지가 있습니다.</span><Button type="button" size="sm" variant="outline" onClick={() => { selectJob(duplicate.id); setDuplicate(null); }}>기존 결과 보기</Button><Button type="button" size="sm" disabled={busy} onClick={() => void upload(true)}>새로 만들기</Button></div> : null}
          </form>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p role="status" className="text-sm">{notice}</p> : null}
          {jobs.length ? <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="pdf-history">처리 이력</Label><select id="pdf-history" disabled={busy} className="max-w-full rounded-md border p-2 text-sm" value={selected?.id ?? ""} onChange={(event) => selectJob(event.target.value)}>{jobs.map((job) => <option key={job.id} value={job.id}>{job.file_name} · {job.stage}</option>)}</select>
            <Button type="button" size="sm" variant="ghost" onClick={() => setRefresh((value) => value + 1)}><RefreshCw />새로고침</Button>
          </div> : null}
          {selected ? <div className="space-y-3">
            <div role="status" className="flex flex-wrap items-center gap-3 text-sm"><span>{selected.stage} · {selected.progress}%</span>
              <progress max={100} value={selected.progress} aria-label="PDF 페이지 이미지 생성 진행률" className="h-2 w-48" />
              {selected.status === "failed" ? <><span className="text-destructive">{selected.error_message}</span><Button size="sm" disabled={busy} onClick={() => void action("retry")}>다시 시도</Button></> : null}
              {selected.status === "uploaded" ? <Button size="sm" disabled={busy} onClick={() => void action("queue")}>페이지 이미지 만들기</Button> : null}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void action("source")}>원본 PDF 열기</Button>
              <Button size="sm" variant="ghost" disabled={busy || ["queued", "processing"].includes(selected.status)} onClick={() => void remove()}>PDF 삭제</Button>
              {pageImageResult ? <Button size="sm" onClick={() => insert(pageImageResult)}>페이지 이미지를 본문 끝에 추가</Button> : null}
            </div>
            {selected.status === "queued" ? <p className="text-sm text-muted-foreground">페이지 이미지 생성을 기다리고 있습니다. 대기가 오래 지속되면 관리자에게 문의해 주세요.</p> : null}
            {result && !pageImageResult ? <p role="alert" className="rounded-md bg-muted p-3 text-sm">이전 방식으로 텍스트 변환된 결과입니다. 페이지 이미지로 추가하려면 PDF를 다시 업로드해 주세요.</p> : null}
            {pageImageResult ? <div className="space-y-3">
              <p className="text-xs text-muted-foreground">페이지별 이미지를 확인한 뒤 본문에 추가하고 편집 화면에서 저장해 주세요. 기존 내용은 유지됩니다.</p>
              <div className="flex gap-2 xl:hidden"><Button variant={mobilePanel === "content" ? "secondary" : "ghost"} size="sm" onClick={() => setMobilePanel("content")}>페이지 이미지</Button><Button variant={mobilePanel === "source" ? "secondary" : "ghost"} size="sm" onClick={() => setMobilePanel("source")}>원본 PDF</Button></div>
              <div className="grid min-w-0 gap-3 xl:grid-cols-2">
                <div className={`${mobilePanel === "content" ? "block" : "hidden"} max-h-[55dvh] min-w-0 space-y-4 overflow-y-auto rounded-lg border p-4 xl:block`}>
                  {pageImageResult.blocks.map((block) => <div key={block.id} className="space-y-2 border-b pb-4 last:border-b-0">
                    <p className="text-xs font-medium">{block.source.page}페이지</p>
                    <DocumentRenderer blocks={[{ id: block.id, type: "rich_text", content: block.node }]} />
                    <button className="text-xs text-muted-foreground underline" onClick={() => setSourcePage(block.source.page)}>원본 {block.source.page}페이지</button>
                    {block.issues.map((issue, index) => <p key={index} className="text-xs text-amber-700 dark:text-amber-400">검수 필요: {issue}</p>)}
                  </div>)}
                </div>
                <div className={`${mobilePanel === "source" ? "block" : "hidden"} min-w-0 rounded-lg border p-2 xl:block`}>
                  <div className="mb-2 flex items-center gap-2 text-sm"><Label htmlFor="pdf-page">원본 페이지</Label><Input id="pdf-page" type="number" min={1} max={pageImageResult.pageCount} className="h-8 w-20" value={sourcePage} onChange={(event) => setSourcePage(Math.max(1, Math.min(pageImageResult.pageCount, Number(event.target.value) || 1)))} />{sourceUrl ? <a href={`${sourceUrl}#page=${sourcePage}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="underline">새 창</a> : null}</div>
                  {sourceUrl ? <iframe key={`${sourceUrl}-${sourcePage}`} src={`${sourceUrl}#page=${sourcePage}`} referrerPolicy="no-referrer" title={`원본 PDF ${sourcePage}페이지`} className="h-[48dvh] w-full" /> : <Button variant="outline" disabled={busy} onClick={() => void action("source")}>원본 PDF 불러오기</Button>}
                  <p className="mt-2 text-xs text-muted-foreground">원본을 열 수 없으면 주소가 만료되었을 수 있습니다. 원본 PDF 열기를 다시 눌러 주세요.</p>
                </div>
              </div>
            </div> : null}
          </div> : null}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
