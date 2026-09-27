"use client";

import { useState, type FormEvent } from "react";
import { LoaderCircle, Mail, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Analysis } from "@/lib/youtube-analyzer/model";

export function ChannelEmailEditor({ run, onSaved }: {
  run: Analysis;
  onSaved: (channelId: string, email: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const email = run.email ?? "";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/youtube-channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: run.channel_id, email: draft.trim() }),
      });
      const result = await response.json() as { email?: string | null; error?: string };
      if (!response.ok) throw new Error(result.error ?? "이메일을 저장하지 못했습니다.");
      onSaved(run.channel_id, result.email ?? null);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "이메일을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="min-w-0 space-y-1.5">
    {email ? <a href={`mailto:${encodeURIComponent(email)}`} className="flex items-start gap-1.5 break-all text-sm text-primary hover:underline"><Mail className="mt-0.5 size-3.5 shrink-0" />{email}</a> : <span className="text-xs text-muted-foreground">미등록</span>}
    <Dialog open={open} onOpenChange={(next) => {
      if (saving) return;
      setOpen(next);
      if (next) { setDraft(email); setError(""); }
    }}>
      <DialogTrigger asChild><Button type="button" variant="outline" size="sm" aria-label={`${run.channel.name} 이메일 ${email ? "수정" : "추가"}`}><Pencil className="size-3.5" />{email ? "수정" : "추가"}</Button></DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{run.channel.name} 이메일</DialogTitle>
          <DialogDescription>채널 연락용 이메일을 저장합니다. 입력을 비우고 저장하면 삭제됩니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="youtube-channel-email">이메일 주소</Label>
            <Input id="youtube-channel-email" type="email" autoComplete="email" maxLength={254} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="name@example.com" disabled={saving} />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={saving}>취소</Button></DialogClose>
            <Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}저장</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
