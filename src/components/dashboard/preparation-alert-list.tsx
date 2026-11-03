"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { PreparationAlert } from "@/lib/dashboard/preparation-alerts";

export function PreparationAlertList({ initialAlerts }: { initialAlerts: PreparationAlert[] }) {
  const [alerts, setAlerts] = useState(initialAlerts);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function complete(alert: PreparationAlert) {
    setBusy(alert.key); setError("");
    try {
      const response = await fetch("/api/dashboard/preparation-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alert) });
      if (!response.ok) throw new Error();
      setAlerts((current) => current.filter((item) => item.key !== alert.key));
    } catch { setError("알림을 완료 처리하지 못했습니다. 다시 시도해 주세요."); } finally { setBusy(""); }
  }
  return <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-center gap-2"><CheckCircle2 className="size-5 text-amber-700" /><h2 className="text-lg font-semibold text-slate-950">사전 준비 알림</h2></div>{error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}{alerts.length ? <div className="space-y-2">{alerts.map((alert) => <label key={alert.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-white p-3 text-sm"><Checkbox checked={false} disabled={Boolean(busy)} onCheckedChange={(checked) => { if (checked === true) void complete(alert); }} aria-label={`${alert.title} 완료`} /><span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{alert.title}</span><span className="mt-1 block text-xs text-muted-foreground">{alert.description}</span></span>{busy === alert.key ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}</label>)}</div> : <p className="text-sm text-muted-foreground">확인할 사전 준비 알림이 없습니다.</p>}</section>;
}
