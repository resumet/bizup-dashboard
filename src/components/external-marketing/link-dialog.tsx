"use client";

import { useState } from "react";
import { ClipboardCopy, ExternalLink, Link2Off, Loader2, LockKeyhole, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ExternalMarketingLinkDialog({ url, enabled, onClose, onEnabledChange }: {
  url: string;
  enabled: boolean;
  onClose: () => void;
  onEnabledChange: (enabled: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function changeEnabled(next: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onEnabledChange(next);
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
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" aria-busy={busy}>
      <DialogHeader>
        <DialogTitle>광고성과 외부 공유</DialogTitle>
        <DialogDescription>공개하면 링크를 가진 사람이 로그인 없이 광고성과를 보고 강의 정보를 수정할 수 있습니다. 비활성화하면 기존 링크의 접근이 즉시 차단됩니다.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
        <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{enabled ? <Share2 className="size-5" /> : <Link2Off className="size-5" />}</span><div><p role="status" className="text-sm font-semibold">{enabled ? "공개 중" : "비공개"}</p><p className="mt-1 text-xs text-muted-foreground">{enabled ? "링크를 가진 사람이 광고성과를 볼 수 있습니다." : "외부 공개가 비활성화되어 있습니다."}</p></div></div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void changeEnabled(!enabled)}>{busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />}{enabled ? "공개 비활성화" : "공개 활성화"}</Button>
      </div>
      <div className="grid gap-2"><Label htmlFor="external-marketing-share-url">공개 링크</Label><div className="flex gap-2">
        <Input id="external-marketing-share-url" className="min-w-0" value={url} readOnly onFocus={(event) => event.target.select()} />
        <Button type="button" variant="outline" disabled={busy} onClick={() => void copyAddress()}><ClipboardCopy />복사</Button>
      </div></div>
      {enabled ? <Button variant="outline" className="w-fit" asChild><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink />공개 페이지 열기</a></Button> : <Button variant="outline" className="w-fit" disabled><ExternalLink />공개 페이지 열기</Button>}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}
      <DialogFooter><Button type="button" disabled={busy} onClick={() => void copyAddress()}><ClipboardCopy />링크 복사</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
