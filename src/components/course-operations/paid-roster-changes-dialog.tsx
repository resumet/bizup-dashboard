"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RosterPreview } from "@/lib/course-orders/reconcile-roster";

const money = (value: number) => `${value.toLocaleString("ko-KR")}원`;

export function PaidRosterChangesDialog({ preview, onApply, onClose }: {
  preview: RosterPreview; onApply: (selectedIds: string[]) => Promise<void>; onClose: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set(preview.changes.filter(c => c.kind === "add").map(c => c.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function apply() {
    setSaving(true); setError("");
    try { await onApply([...selected]); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "반영하지 못했습니다."); }
    finally { setSaving(false); }
  }
  const added = preview.changes.filter(c => c.kind === "add").length;
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl" showCloseButton={!saving}>
      <DialogHeader className="shrink-0 pr-6">
        <DialogTitle>유료수강생 변경 미리보기</DialogTitle>
        <DialogDescription>반영할 수강생을 선택하세요. 기존 수강생은 결제금액과 옵션명만 변경하며, 카카오톡 참여 이력·연결 수강생·연락처·메모·결제ID 등은 유지합니다.</DialogDescription>
      </DialogHeader>
      <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">신규 {added}건 · 변경 {preview.changes.length - added}건 · 변경 없음 {preview.unchangedCount}건 · 확인 필요 {preview.conflicts.length}건</p>
          {preview.changes.length > 0 && <Button size="sm" variant="outline" disabled={saving} onClick={() => setSelected(selected.size === preview.changes.length ? new Set() : new Set(preview.changes.map(c => c.id)))}>{selected.size === preview.changes.length ? "전체 해제" : "전체 선택"}</Button>}
        </div>
        {preview.changes.map(change => <section key={change.id} className="space-y-3 rounded-lg border p-3" aria-label={`${change.name} 변경 항목`}>
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox className="mt-1" aria-label={`${change.name} ${change.kind === "add" ? "신규 추가" : "변경 반영"}`} checked={selected.has(change.id)} disabled={saving} onCheckedChange={checked => setSelected(current => {
              const next = new Set(current); if (checked === true) next.add(change.id); else next.delete(change.id); return next;
            })} />
            <span className="min-w-0"><strong>{change.name || "이름 없음"}</strong> <span className="text-xs text-muted-foreground">{change.phone} · {change.kind === "add" ? "신규 추가" : change.kind === "merge" ? "기존 명단 갱신·중복 정리" : "기존 명단 갱신"}</span></span>
          </label>
          <p className="break-words text-sm leading-relaxed">{change.reason}</p>
          <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-md bg-muted p-3 text-sm">
            <dt className="text-muted-foreground">결제금액</dt><dd className="break-words tabular-nums">{change.before ? `${money(change.before.paymentAmount)} → ` : ""}<strong>{money(change.after.paymentAmount)}</strong>{change.before?.paymentAmount === change.after.paymentAmount && <span className="ml-2 text-xs text-muted-foreground">동일</span>}</dd>
            <dt className="text-muted-foreground">옵션명</dt><dd className="break-words">{change.before ? `${change.before.optionName || "없음"} → ` : ""}<strong>{change.after.optionName || "없음"}</strong>{change.before?.optionName === change.after.optionName && <span className="ml-2 text-xs text-muted-foreground">동일</span>}</dd>
          </dl>
        </section>)}
        {preview.conflicts.map((conflict, index) => <div key={index} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>{conflict.name} · 확인 필요</strong><p className="mt-1">{conflict.reason}</p></div>)}
        {!preview.changes.length && <p className="py-4 text-center text-sm text-muted-foreground">자동으로 반영할 변경 사항이 없습니다.</p>}
      </div>
      {error && <p role="alert" className="shrink-0 text-sm text-destructive">{error}</p>}
      <DialogFooter className="shrink-0">
        <Button variant="outline" disabled={saving} onClick={onClose}>닫기</Button>
        <Button disabled={saving || !selected.size} onClick={() => void apply()}>{saving ? "반영 중…" : `선택한 ${selected.size}건 반영`}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
