"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Pencil } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ManualEnrollmentName({
  jobId,
  enrollmentId,
  name,
  editable,
  onSaved,
}: {
  jobId: string;
  enrollmentId: string;
  name: string;
  editable: boolean;
  onSaved: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!editable) return <>{name || "-"}</>;

  function handleOpenChange(nextOpen: boolean) {
    if (saving) return;
    setOpen(nextOpen);
    if (nextOpen) setDraft(name);
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/enrollments/${enrollmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: draft }),
      });
      const body = (await response.json()) as { message?: string; customerName?: string };
      if (!response.ok || !body.customerName) {
        throw new Error(body.message ?? "이름을 저장하지 못했습니다.");
      }
      onSaved(body.customerName);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "이름을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="link"
        className="h-auto gap-1 p-0 font-medium"
        onClick={() => handleOpenChange(true)}
        aria-label={`${name || "수강생"} 이름 수정`}
      >
        {name || "-"}
        <Pencil className="size-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={save} className="space-y-5">
            <DialogHeader>
              <DialogTitle>수강생 이름 수정</DialogTitle>
              <DialogDescription>수동으로 추가한 수강생의 이름을 변경합니다.</DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>저장할 수 없습니다</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor={`manual-name-${enrollmentId}`}>이름</Label>
              <Input
                id={`manual-name-${enrollmentId}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={120}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={() => handleOpenChange(false)}>취소</Button>
              <Button type="submit" disabled={saving || !draft.trim()}>
                {saving ? <Loader2 className="animate-spin" /> : null}
                {saving ? "저장 중" : "저장"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
