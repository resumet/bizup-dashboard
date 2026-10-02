"use client";

import { useId, useState, type FormEvent } from "react";
import { FilePenLine, LoaderCircle } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EmailSignatureMode, YoutubeEmailSettings } from "@/lib/youtube-analyzer/model";

export function EmailDraftSettings({ settings, onSaved }: {
  settings: YoutubeEmailSettings;
  onSaved: (settings: YoutubeEmailSettings) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [signatureMode, setSignatureMode] = useState<EmailSignatureMode>("gmail_default");
  const [customSignature, setCustomSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function changeOpen(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (next) {
      setSubject(settings.email_subject ?? "");
      setBody(settings.email_body ?? "");
      setSignatureMode(settings.signature_mode);
      setCustomSignature(settings.custom_signature ?? "");
      setError("");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (signatureMode === "custom" && !customSignature.trim()) {
      setError("사용할 서명을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/youtube-channels/email-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailSubject: subject,
          emailBody: body,
          signatureMode,
          customSignature: signatureMode === "custom" ? customSignature : null,
        }),
      });
      const result = await response.json() as YoutubeEmailSettings & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "이메일 양식을 저장하지 못했습니다.");
      onSaved(result);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "이메일 양식을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline">
        <FilePenLine className="size-4" />
        이메일 양식
      </Button>
    </DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>이메일 양식</DialogTitle>
        <DialogDescription className="sr-only">채널 이메일을 열 때 사용할 공통 제목, 본문과 서명을 저장합니다.</DialogDescription>
      </DialogHeader>
      <form onSubmit={(event) => void save(event)} className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${id}-subject`}>제목</Label>
            <span className="text-xs text-muted-foreground">{subject.length.toLocaleString("ko-KR")} / 500</span>
          </div>
          <Input
            id={`${id}-subject`}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={500}
            placeholder="이메일 제목을 입력하세요."
            disabled={saving}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${id}-body`}>본문</Label>
            <span className="text-xs text-muted-foreground">{body.length.toLocaleString("ko-KR")} / 5,000</span>
          </div>
          <Textarea
            id={`${id}-body`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            rows={14}
            placeholder="이메일 본문을 입력하세요."
            disabled={saving}
            className="resize-y leading-6"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-signature-mode`}>서명</Label>
          <select
            id={`${id}-signature-mode`}
            value={signatureMode}
            onChange={(event) => setSignatureMode(event.target.value as EmailSignatureMode)}
            disabled={saving}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="gmail_default">선택한 Gmail 계정의 기본 서명</option>
            <option value="custom">직접 입력한 서명</option>
          </select>
        </div>
        {signatureMode === "custom" ? <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor={`${id}-custom-signature`}>직접 입력한 서명</Label>
            <span className="text-xs text-muted-foreground">{customSignature.length.toLocaleString("ko-KR")} / 2,000</span>
          </div>
          <Textarea
            id={`${id}-custom-signature`}
            value={customSignature}
            onChange={(event) => setCustomSignature(event.target.value)}
            maxLength={2000}
            rows={6}
            placeholder="이름, 소속, 연락처 등을 입력하세요."
            disabled={saving}
            className="resize-y leading-6"
          />
        </div> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline" disabled={saving}>취소</Button></DialogClose>
          <Button type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            저장
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
