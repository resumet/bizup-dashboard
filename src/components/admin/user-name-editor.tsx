"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function UserNameEditor({ userId, initialName }: { userId: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 30 || saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${userId}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await response.json() as { message?: string; name?: string };
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) throw new Error(body.message ?? "사용자 이름을 저장하지 못했습니다.");
      const nextName = body.name ?? trimmed;
      setName(nextName);
      setSavedName(nextName);
      setSaved(true);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "사용자 이름을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const canSave = Boolean(name.trim()) && name.trim().length <= 30 && name.trim() !== savedName;
  return <div className="min-w-56 space-y-1.5">
    <div className="flex items-center gap-2">
      <Input
        aria-label={`${savedName} 사용자 이름`}
        value={name}
        maxLength={30}
        onChange={(event) => { setName(event.target.value); setSaved(false); }}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveName(); } }}
        className="w-36"
      />
      <Button size="sm" variant="outline" onClick={() => void saveName()} disabled={!canSave || saving}>
        {saving ? <Loader2 className="animate-spin" /> : <Save />}저장
      </Button>
      {saved ? <Check className="size-4 text-emerald-600" aria-label="저장됨" /> : null}
    </div>
    {error ? <p className="max-w-64 text-xs whitespace-normal text-destructive" role="alert">{error}</p> : null}
  </div>;
}
