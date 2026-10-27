"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2, LockKeyhole, RefreshCw, Share2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InstagramPublicPageDialog({
  path,
  enabled,
  busy,
  onChangeAccess,
}: {
  path: string;
  enabled: boolean;
  busy: boolean;
  onChangeAccess: (enabled: boolean, regenerateToken?: boolean) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const absoluteUrl = path && origin ? new URL(path, origin).toString() : "";

  async function changeAccess(nextEnabled: boolean, regenerateToken = false) {
    setError("");
    setNotice("");
    setCopied(false);
    try {
      const message = await onChangeAccess(nextEnabled, regenerateToken);
      setNotice(message);
      if (regenerateToken) setRegenerateOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "공개페이지 설정을 변경하지 못했습니다.");
    }
  }

  async function copyAddress() {
    setError("");
    setNotice("");
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setNotice("공개페이지 주소를 복사했습니다.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("주소를 복사하지 못했습니다. 주소를 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (busy) return;
        setOpen(nextOpen);
        if (nextOpen) {
          setOrigin(window.location.origin);
          setCopied(false);
          setError("");
          setNotice("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={busy}>
          <Link2 />공개페이지 만들기
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" aria-busy={busy}>
        <DialogHeader>
          <DialogTitle>인스타그램 공개페이지</DialogTitle>
          <DialogDescription>
            공개하면 링크를 받은 강사님이 로그인 없이 릴스 콘텐츠 정보를 작성할 수 있습니다.
            비공개로 만들면 기존 주소의 접근이 즉시 차단됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4">
          <div className="flex items-start gap-3">
            <span className={enabled ? "grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" : "grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"}>
              {enabled ? <Share2 className="size-5" /> : <LockKeyhole className="size-5" />}
            </span>
            <div>
              <p className="text-sm font-semibold" role="status">{enabled ? "공개 중" : "비공개"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {enabled ? "링크를 받은 강사님이 릴스 콘텐츠를 작성할 수 있습니다." : "외부에서는 릴스 작성 화면에 접근할 수 없습니다."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant={enabled ? "outline" : "default"}
            disabled={busy}
            onClick={() => void changeAccess(!enabled)}
          >
            {busy ? <Loader2 className="animate-spin" /> : enabled ? <LockKeyhole /> : <Share2 />}
            {enabled ? "비공개로 만들기" : "공개페이지 만들기"}
          </Button>
        </div>

        {enabled ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="instagram-public-page-url">공개페이지 주소</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="instagram-public-page-url"
                  className="min-w-0"
                  value={absoluteUrl}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button type="button" variant="outline" disabled={busy || !absoluteUrl} onClick={() => void copyAddress()}>
                  {copied ? <Check /> : <Copy />}{copied ? "복사됨" : "복사하기"}
                </Button>
              </div>
            </div>
            <Button type="button" variant="outline" disabled={!absoluteUrl} asChild={Boolean(absoluteUrl)}>
              {absoluteUrl ? <a href={absoluteUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />공개페이지 열기</a> : <><ExternalLink />공개페이지 열기</>}
            </Button>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground" role="status">{notice}</p> : null}

        <DialogFooter className="sm:justify-between">
          {enabled ? (
            <AlertDialog open={regenerateOpen} onOpenChange={(nextOpen) => { if (!busy) setRegenerateOpen(nextOpen); }}>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" disabled={busy}>
                  <RefreshCw />재발급
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>공개페이지 주소를 재발급할까요?</AlertDialogTitle>
                  <AlertDialogDescription>
                    기존 주소는 즉시 사용할 수 없게 됩니다. 새 주소를 공유하기 전까지 강사님은 공개페이지에 접근할 수 없습니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={busy}
                    onClick={(event) => {
                      event.preventDefault();
                      void changeAccess(true, true);
                    }}
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    재발급
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : <span />}
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={busy}>닫기</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
