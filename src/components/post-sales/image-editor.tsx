"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

export function SalesImageEditor({ label, url, busy, onSave, onDelete }: {
  label: string; url: string; busy: boolean; onSave: (file: File) => Promise<boolean>; onDelete: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function choose(next?: File) {
    if (!next || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) { toast("JPG, PNG, WebP 이미지를 선택해 주세요.", { tone: "error" }); return; }
    if (next.size > 10 * 1024 * 1024) { toast("10MB 이하의 이미지를 선택해 주세요.", { tone: "error" }); return; }
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }
  return <div className="space-y-3">
    {url && <div className="space-y-2 rounded-lg border p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="max-h-56 w-full rounded-md object-contain" />
      <Button type="button" variant="outline" disabled={busy} onClick={() => void onDelete()}>이미지 삭제</Button>
    </div>}
    <Button type="button" variant="outline" disabled={busy} onClick={() => { setFile(null); setPreview(""); setOpen(true); }}>{url ? `${label} 변경하기` : `${label} 추가하기`}</Button>
    <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
      <DialogContent aria-describedby={undefined} onPaste={event => {
        const image = Array.from(event.clipboardData.items).find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
        if (image) { event.preventDefault(); event.stopPropagation(); choose(image); }
      }}>
        <DialogHeader><DialogTitle>{label} 추가하기</DialogTitle></DialogHeader>
        <label className="space-y-2 text-sm">이미지 선택<Input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => choose(event.target.files?.[0])} /></label>
        <div tabIndex={0} aria-label="이미지 붙여넣기" className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">이미지를 복사한 뒤 이 팝업에서 Ctrl+V로 붙여넣으세요. (최대 10MB)</div>
        {file && preview && <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="선택한 이미지 미리보기" className="max-h-[45dvh] w-full object-contain" />
        </>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>취소</Button><Button disabled={!file || busy} onClick={async () => { if (file && await onSave(file)) { setOpen(false); setFile(null); setPreview(""); } }}>{busy ? "저장 중…" : "저장하기"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
