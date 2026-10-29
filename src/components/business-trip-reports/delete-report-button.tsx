"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DeleteBusinessTripReportButton({ reportId, title, version }: { reportId: string; title: string; version: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (busy || !window.confirm(`“${title}” 출장보고서를 삭제할까요?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/business-trip-reports/${reportId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const body = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "출장보고서를 삭제하지 못했습니다.");
      router.push("/services/business-trip-reports");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "출장보고서를 삭제하지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="destructive" onClick={() => void remove()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
        삭제
      </Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
