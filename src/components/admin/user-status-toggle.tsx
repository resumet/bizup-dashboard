"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserStatusToggle({ userId, email, initialActive, disabled = false }: { userId: string; email: string; initialActive: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function change(next: boolean) {
    if (!next && !window.confirm(`${email} 계정을 비활성화할까요? 로그인과 새 업무 할당이 제한되며 기존 기록은 보존됩니다.`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/users/${userId}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: next }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "계정 상태 변경 실패");
      setActive(body.active); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "계정 상태 변경 실패"); }
    finally { setSaving(false); }
  }
  return <div className="min-w-28 space-y-1"><label className="flex items-center gap-2 whitespace-nowrap"><input type="checkbox" role="switch" aria-label={`${email} 계정 활성`} checked={active} disabled={disabled || saving} onChange={e => void change(e.target.checked)} className="size-4 accent-blue-600"/><span>{saving ? "저장 중" : active ? "활성" : "비활성"}</span></label>{error && <p role="alert" className="max-w-56 text-xs text-destructive">{error}</p>}</div>;
}
