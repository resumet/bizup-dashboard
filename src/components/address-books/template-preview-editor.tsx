"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function TemplatePreviewEditor({ templateId, templateName, initialBody = "", showPreviewButton = true, onBodyChange }: { templateId: string; templateName: string; initialBody?: string; showPreviewButton?: boolean; onBodyChange?: (body: string) => void }) {
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [savedBody, setSavedBody] = useState(initialBody);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const url = `/api/message-templates/${encodeURIComponent(templateId)}/preview`;

  async function edit() {
    setOpen(true);
    setBusy(true);
    setLoaded(false);
    setBody("");
    setError("");
    try {
      const response = await fetch(url, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setBody(result.body);
      setSavedBody(result.body);
      onBodyChange?.(result.body);
      setLoaded(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "본문 조회 실패");
    } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setSavedBody(body);
      onBodyChange?.(body);
      setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "본문 저장 실패");
    } finally { setBusy(false); }
  }

  return <>
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={edit}>미리보기 본문 설정</Button>
      {showPreviewButton ? <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)} disabled={!savedBody.trim() || busy}>
        <Eye />미리보기
      </Button> : null}
    </div>
    <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{templateName} · 템플릿 미리보기</DialogTitle>
          <DialogDescription>저장된 템플릿 본문입니다. 변수는 발송할 때 고객별 값으로 바뀝니다.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border bg-muted/30 p-5 text-sm leading-relaxed">
          {savedBody}
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{templateName} · 미리보기 본문</DialogTitle><DialogDescription>발송 서비스에 등록된 본문을 그대로 붙여넣으세요. 변수는 #{"{고객명}"} 형식으로 입력합니다. 이 본문은 미리보기에만 사용되며 실제 발송 템플릿은 발송 서비스에서 관리합니다.</DialogDescription></DialogHeader>
        <Label htmlFor={`preview-body-${templateId}`}>템플릿 본문</Label>
        <Textarea id={`preview-body-${templateId}`} className="min-h-64" value={body} onChange={(event) => setBody(event.target.value)} disabled={busy || !loaded} maxLength={10000} />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button onClick={save} disabled={busy || !loaded}>{busy ? "처리 중" : "저장"}</Button>
      </DialogContent>
    </Dialog>
  </>;
}
