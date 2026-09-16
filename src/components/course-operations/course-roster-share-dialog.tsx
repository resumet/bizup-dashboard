"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "공유 링크를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
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
            링크를 가진 사람은 로그인 없이 이름·전화번호·이메일·옵션을 볼 수 있습니다.
            결제금액은 공개하지 않습니다.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />공유 상태를 확인하는 중입니다.
          </p>
        ) : path ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="course-roster-share-url">공유 링크</Label>
              <div className="flex gap-2">
                <Input id="course-roster-share-url" value={url} readOnly />
                <Button type="button" variant="outline" onClick={copyLink}>
                  {copied ? <Check /> : <Copy />}{copied ? "복사됨" : "복사"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">공개 페이지는 현재 결제완료 주문을 자동으로 반영합니다.</p>
            <Button type="button" variant="outline" asChild>
              <a href={url} target="_blank" rel="noreferrer"><ExternalLink />공개 페이지 열기</a>
            </Button>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

        <DialogFooter>
          {path ? <Button type="button" onClick={copyLink}>{copied ? <Check /> : <Copy />}{copied ? "복사됨" : "링크 복사"}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
