"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EditableAccountRole } from "@/lib/admin/access";

export function UserRoleSelect({
  userId,
  email,
  initialRole,
}: {
  userId: string;
  email: string;
  initialRole: EditableAccountRole;
}) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function changeRole(nextRole: string) {
    if (nextRole !== "admin" && nextRole !== "user") return;
    if (nextRole === role) return;

    const previousRole = role;
    setRole(nextRole);
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const body = (await response.json()) as { message?: string };
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(body.message ?? "권한을 변경하지 못했습니다.");
      }

      setSaved(true);
      router.refresh();
    } catch (caught) {
      setRole(previousRole);
      setError(
        caught instanceof Error ? caught.message : "권한을 변경하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-40 space-y-1.5">
      <div className="flex items-center gap-2">
        <Select value={role} onValueChange={changeRole} disabled={saving}>
          <SelectTrigger aria-label={`${email} 권한`} className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">관리자</SelectItem>
            <SelectItem value="user">사용자</SelectItem>
          </SelectContent>
        </Select>
        {saving ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : saved ? (
          <Check className="size-4 text-emerald-600" aria-label="저장됨" />
        ) : null}
      </div>
      {error ? (
        <p className="max-w-64 text-xs whitespace-normal text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
