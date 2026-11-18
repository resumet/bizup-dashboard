"use client";

import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";

export function UserPasswordEditor({ userId, email, disabled = false }: { userId: string; email: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function close() {
    if (saving) return;
    setOpen(false);
    setPassword("");
    setConfirmation("");
    setError("");
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmation }),
      });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "비밀번호를 변경하지 못했습니다.");
      toast("비밀번호를 변경했습니다.");
      setOpen(false);
      setPassword("");
      setConfirmation("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "비밀번호를 변경하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}><KeyRound />변경</Button>
    <Dialog open={open} onOpenChange={(next) => { if (next) setOpen(true); else close(); }}>
      <DialogContent className="sm:max-w-md" showCloseButton={!saving}>
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <DialogHeader><DialogTitle>비밀번호 변경</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{email} 계정의 새 비밀번호를 설정합니다.</p>
          <div className="space-y-2"><Label htmlFor={`password-${userId}`}>새 비밀번호</Label><Input id={`password-${userId}`} type="password" autoComplete="new-password" minLength={6} maxLength={128} required disabled={saving} value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor={`password-confirmation-${userId}`}>새 비밀번호 확인</Label><Input id={`password-confirmation-${userId}`} type="password" autoComplete="new-password" minLength={6} maxLength={128} required disabled={saving} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={close}>취소</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <KeyRound />}{saving ? "변경 중" : "비밀번호 변경"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
