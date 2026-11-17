"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Toast } from "radix-ui";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ToastTone = "success" | "error" | "info";
type ToastOptions = { tone?: ToastTone; duration?: number; onDismiss?: () => void };
type ToastEntry = ToastOptions & { id: number; message: string };
const EVENT = "bizup:toast";
let nextId = 0;

/** Call after a confirmed mutation, before navigation if needed. Never during render. */
export function toast(message: string, options: ToastOptions = {}) {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(new CustomEvent<ToastEntry>(EVENT, {
    detail: { ...options, id: ++nextId, message },
  }));
}

/** Mounted once in the root layout; notifications survive page/dialog unmounts. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ToastEntry[]>([]);
  useLayoutEffect(() => {
    const receive = (event: Event) => {
      const entry = (event as CustomEvent<ToastEntry>).detail;
      setEntries((current) => [...current, entry]);
    };
    window.addEventListener(EVENT, receive);
    return () => window.removeEventListener(EVENT, receive);
  }, []);

  return <Toast.Provider label="작업 알림" duration={4000} swipeDirection="right">
    {children}
    {entries.map((entry) => {
      const tone = entry.tone ?? "success";
      const Icon = tone === "error" ? CircleAlert : tone === "info" ? Info : CheckCircle2;
      return <Toast.Root key={entry.id} data-app-toast="" data-tone={tone}
        duration={entry.duration ?? (tone === "error" ? 8000 : 4000)}
        onOpenChange={(open) => {
          if (!open) {
            setEntries((current) => current.filter((item) => item.id !== entry.id));
            entry.onDismiss?.();
          }
        }}
        className="pointer-events-auto flex items-center gap-3 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg">
        <Icon aria-hidden="true" className={`size-5 shrink-0 ${tone === "error" ? "text-destructive" : tone === "info" ? "text-blue-600" : "text-emerald-600"}`} />
        <Toast.Description className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{entry.message}</Toast.Description>
        <Toast.Close asChild><Button type="button" size="icon-sm" variant="ghost" aria-label="알림 닫기"><X /></Button></Toast.Close>
      </Toast.Root>;
    })}
    {entries.length ? createPortal(
      <Toast.Viewport label="작업 알림" aria-live="off" className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[200] mx-auto flex max-h-[50dvh] max-w-xl list-none flex-col gap-2 overflow-y-auto outline-none" />,
      document.body,
    ) : null}
  </Toast.Provider>;
}

/** Adapter for existing state-based feedback. Use eventKey for repeated identical events. */
export function ToastNotice({ message, tone = "success", eventKey, onDismiss }: {
  message: string | null | undefined;
  tone?: ToastTone;
  eventKey?: string | number;
  onDismiss?: () => void;
}) {
  const dismiss = useRef(onDismiss);
  const delivered = useRef<{ message: string; tone: ToastTone; eventKey?: string | number } | null>(null);
  useEffect(() => { dismiss.current = onDismiss; }, [onDismiss]);
  useEffect(() => {
    if (!message) { delivered.current = null; return; }
    const previous = delivered.current;
    if (previous?.message === message && previous.tone === tone && previous.eventKey === eventKey) return;
    const notification = { message, tone, eventKey };
    delivered.current = notification;
    toast(message, { tone, onDismiss: () => { if (delivered.current === notification) dismiss.current?.(); } });
  }, [message, tone, eventKey]);
  return null;
}
