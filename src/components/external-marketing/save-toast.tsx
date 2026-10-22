"use client";

import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExternalMarketingSaveToast({ message, onDismiss }: { message: string; onDismiss: (value: string) => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => onDismiss(""), 4_000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return message ? <div role="status" aria-live="polite" aria-atomic="true" className="fixed inset-x-4 bottom-4 z-[100] flex items-center gap-3 rounded-lg border bg-background p-4 text-sm shadow-lg sm:right-6 sm:left-auto sm:w-96">
    <CheckCircle2 className="size-5 shrink-0 text-green-600" aria-hidden="true" />
    <p className="flex-1">{message}</p>
    <Button type="button" size="icon-sm" variant="ghost" aria-label="저장 알림 닫기" onClick={() => onDismiss("")}><X /></Button>
  </div> : null;
}
