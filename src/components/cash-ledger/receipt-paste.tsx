"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { receiptImageType, type ReceiptAnalysis } from "@/lib/cash-ledger/receipt";

type Props = {
  disabled: boolean;
  onAnalysis: (analysis: ReceiptAnalysis) => void;
  onBusyChange: (busy: boolean) => void;
};

export function ReceiptPaste({ disabled, onAnalysis, onBusyChange }: Props) {
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => { active.current?.abort(); }, []);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  function cancel() {
    active.current?.abort(); active.current = null;
    setBusy(false); onBusyChange(false); setNotice("분석을 취소했습니다.");
  }

  async function analyze(file: File) {
    if (disabled || active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); onBusyChange(true); setError(""); setNotice("");
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/cash-ledger/analyze-receipt", { method: "POST", body, signal: controller.signal });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "이미지를 분석하지 못했습니다. 다시 시도해 주세요.");
      if (controller.signal.aborted) return;
      const analysis = result.analysis as ReceiptAnalysis;
      onAnalysis(analysis);
      setNotice(`승인 내역을 입력했습니다. 금액과 지급대상을 확인하고 제목을 입력해 주세요.${analysis.yearInferred ? ` 이미지에 연도가 없어 ${analysis.entryDate.slice(0, 4)}년으로 입력했습니다.` : ""}`);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "이미지를 분석하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); onBusyChange(false); }
    }
  }

  function select(files: File[]) {
    if (disabled || active.current) return;
    setError(""); setNotice("");
    if (files.length !== 1) { setError("카드 승인 이미지 한 장만 붙여넣어 주세요."); return; }
    try { receiptImageType(files[0]); } catch (failure) { setError((failure as Error).message); return; }
    setImage({ file: files[0], url: URL.createObjectURL(files[0]) });
    void analyze(files[0]);
  }

  return <div className="space-y-3">
    <div
      role="group" aria-label="카드 승인 이미지 붙여넣기" aria-busy={busy} tabIndex={disabled || busy ? -1 : 0}
      className="space-y-3 rounded-lg border-2 border-dashed p-4 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
      onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); select(files); } }}
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); select(Array.from(event.dataTransfer.files)); }}
    >
      <div className="flex items-center gap-2 text-sm font-medium"><ClipboardPaste className="size-4" aria-hidden="true" />카드 승인 이미지 붙여넣기</div>
      {image ? <Image src={image.url} alt="붙여넣은 카드 승인 내역" width={480} height={240} unoptimized className="mx-auto max-h-40 w-auto max-w-full rounded object-contain" /> : null}
      <p className="text-xs text-muted-foreground">이곳을 클릭하고 Ctrl+V로 붙여넣거나 이미지를 끌어오세요. 승인 금액, 날짜, 지급대상을 자동 입력합니다. PNG·JPG·WEBP·GIF, 4 MB 이하.</p>
      <Input type="file" aria-label="카드 승인 이미지 선택" accept=".png,.jpg,.jpeg,.webp,.gif" disabled={disabled || busy} onChange={event => { const files = Array.from(event.target.files ?? []); if (files.length) select(files); event.target.value = ""; }} />
      {busy ? <div className="flex items-center justify-between gap-2"><p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden="true" />승인 내역 분석 중…</p><Button type="button" variant="ghost" size="sm" onClick={cancel}>분석 취소</Button></div> : image ? <div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => void analyze(image.file)}>이미지 다시 분석</Button><Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { setImage(null); setError(""); setNotice(""); }}>이미지 지우기</Button></div> : null}
    </div>
    {notice ? <p role="status" className="text-xs text-muted-foreground">{notice}</p> : null}
    {error ? <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
  </div>;
}
