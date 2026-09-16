"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2, LockKeyhole, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ShareResponse = {
  path: string;
  enabled: boolean;
};

async function readResponse(response: Response): Promise<ShareResponse> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? "공유 링크를 처리하지 못했습니다.");
  return body as ShareResponse;
}

export function CourseRosterShareDialog({
  courseId,
}: {
  courseId: string;
}) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/course-operations/${courseId}/orders/share`;
  const url = path && typeof window !== "undefined"
    ? new URL(path, window.location.origin).toString()
    : "";

  async function loadShare() {
    setLoading(true);
    setError("");
    try {
      const result = await readResponse(await fetch(endpoint, { cache: "no-store" }));
      setPath(result.path);
      setEnabled(result.enabled);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "공유 링크를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function updateShare(nextEnabled: boolean) {
    setSaving(true);
    setError("");
    try {
      const result = await readResponse(await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      }));
      setPath(result.path);
      setEnabled(result.enabled);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "공유 상태를 변경하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("공유 링크를 복사하지 못했습니다.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) void loadShare();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Link2 />외부 공유
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>수강생 명단 외부 공유</DialogTitle>
          <DialogDescription>
            공개하면 링크를 가진 사람이 로그인 없이 수강생 정보와 결제금액을 볼 수 있습니다.
            비공개로 바꾸면 기존 링크도 즉시 차단됩니다.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />공유 상태를 확인하는 중입니다.
          </p>
        ) : path ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <div className={enabled ? "rounded-lg bg-primary/10 p-2 text-primary" : "rounded-lg bg-muted p-2 text-muted-foreground"}>
                  {enabled ? <Share2 className="size-4" /> : <LockKeyhole className="size-4" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{enabled ? "공개 중" : "비공개"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{enabled ? "링크를 가진 사람이 명단을 볼 수 있습니다." : "기존 공유 링크의 접근이 차단됐습니다."}</p>
                </div>
              </div>
              <Button type="button" variant={enabled ? "outline" : "default"} disabled={saving} onClick={() => void updateShare(!enabled)}>
                {saving ? <Loader2 className="animate-spin" /> : enabled ? <LockKeyhole /> : <Share2 />}
                {enabled ? "비공개로 전환" : "공개로 전환"}
              </Button>
            </div>
            {enabled ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="course-roster-share-url">공유 링크</Label>
                  <div className="flex gap-2">
                    <Input id="course-roster-share-url" value={url} readOnly />
                    <Button type="button" variant="outline" onClick={copyLink}>
                      {copied ? <Check /> : <Copy />}{copied ? "복사됨" : "복사"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">공개 페이지는 현재 결제완료 주문과 전체 결제금액을 자동으로 반영합니다.</p>
                <Button type="button" variant="outline" asChild>
                  <a href={url} target="_blank" rel="noreferrer"><ExternalLink />공개 페이지 열기</a>
                </Button>
              </>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        <DialogFooter>
          {path && enabled ? <Button type="button" onClick={copyLink}>{copied ? <Check /> : <Copy />}{copied ? "복사됨" : "링크 복사"}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
