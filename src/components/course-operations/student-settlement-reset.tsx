"use client";

import { useId, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StudentSettlementResetTarget } from "@/lib/course-operations/student-settlement-reset";

export function StudentSettlementReset({
  courseId,
  courseName,
  target,
  disabled = false,
  onReset,
}: {
  courseId: string;
  courseName: string;
  target: StudentSettlementResetTarget;
  disabled?: boolean;
  onReset: (target: StudentSettlementResetTarget, count: number) => void;
}) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const label = target === "orders" ? "주문내역" : "유료수강생";
  const confirmed = Boolean(courseName.trim()) && confirmation.trim() === courseName.trim();

  function changeOpen(value: boolean) {
    if (pendingRef.current) return;
    setOpen(value);
    setConfirmation("");
    setError("");
  }

  async function reset() {
    if (!confirmed || pendingRef.current || disabled) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/course-operations/${courseId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, confirmation: confirmation.trim() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message ?? `${label}을 리셋하지 못했습니다.`);
      if (body?.target !== target || typeof body?.resetCount !== "number") {
        throw new Error("리셋 결과를 확인하지 못했습니다. 새로고침 후 현재 데이터를 확인해 주세요.");
      }
      setOpen(false);
      setConfirmation("");
      onReset(target, body.resetCount);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `${label}을 리셋하지 못했습니다.`);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled} className="shrink-0 text-destructive">
          <RotateCcw />{label} 리셋
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" showCloseButton={!pending}>
        <DialogHeader><DialogTitle>{label} 리셋</DialogTitle></DialogHeader>
        <form className="grid min-w-0 gap-4" onSubmit={(event) => { event.preventDefault(); void reset(); }}>
          <DialogDescription className="rounded-md border border-destructive/20 bg-destructive/5 p-3 leading-relaxed">
            {target === "orders"
              ? "이 강의의 현재 주문내역 전체가 삭제됩니다. 가져오기 이력과 유료수강생, 비용·정산 정보는 유지됩니다. 삭제한 주문을 되돌리는 기능은 없으며, 필요한 경우 원본 엑셀을 다시 가져와야 합니다."
              : "환불자를 포함해 이 강의의 현재 유료수강생 명단을 비웁니다. 이전 명단·발송 이력과 주문내역, 비용·정산 정보는 유지됩니다."}
          </DialogDescription>
          <div className="min-w-0 space-y-2">
            <Label htmlFor={inputId}>확인을 위해 강의명을 입력해 주세요</Label>
            <p className="break-words text-sm font-medium">{courseName}</p>
            <Input id={inputId} value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off" disabled={pending} aria-invalid={Boolean(error)} />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>취소</Button>
            <Button type="submit" variant="destructive" disabled={!confirmed || pending || disabled}>
              {pending ? <Loader2 className="animate-spin" /> : null}{pending ? "리셋 중…" : `${label} 리셋 실행`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
