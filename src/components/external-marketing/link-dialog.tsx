"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardCopy, Link2Off, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ExternalMarketingLinkDialog({ title, url, enabled, onClose, onEnabledChange }: {
  title: string;
  url: string;
  enabled: boolean;
  onClose: () => void;
  onEnabledChange: (enabled: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function changeEnabled(next: boolean, close = false) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onEnabledChange(next);
      if (close) onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "공개 설정을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function copyAddress() {
    setError("");
    setNotice("");
    try {
      await navigator.clipboard.writeText(url);
      setNotice("주소를 복사했습니다.");
    } catch {
      setError("주소를 복사하지 못했습니다. 주소를 직접 선택해 복사해 주세요.");
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="sm:max-w-md" aria-busy={busy}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">링크의 공개 상태를 변경하고 주소를 복사합니다.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="external-marketing-share-url">링크 주소</Label>
        <Input id="external-marketing-share-url" value={url} readOnly onFocus={(event) => event.target.select()} />
        {!enabled ? <p className="text-sm text-muted-foreground">링크를 활성화하면 이 주소로 외부에서 접근할 수 있습니다.</p> : null}
      </div>
      <div className="grid gap-2">
        <p role="status" className={`flex items-center gap-1.5 text-sm font-medium ${enabled ? "text-emerald-700" : "text-muted-foreground"}`}>
          {enabled ? <CheckCircle2 className="size-4" /> : <Link2Off className="size-4" />}
          {enabled ? "공개됨" : "비공개"}
        </p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void changeEnabled(!enabled)}>
          {busy ? <Loader2 className="animate-spin" /> : <Link2Off />}{enabled ? "링크 비활성화" : "링크 활성화"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void copyAddress()}><ClipboardCopy />주소 복사</Button>
        <Button type="button" variant="destructive" disabled={busy || !enabled} onClick={() => void changeEnabled(false, true)}>공개 중지</Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
    </DialogContent>
  </Dialog>;
}
