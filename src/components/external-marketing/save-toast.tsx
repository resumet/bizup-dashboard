"use client";
import { ToastNotice } from "@/components/ui/toast";

export function ExternalMarketingSaveToast({ message, onDismiss }: { message: string; onDismiss: (value: string) => void }) {
  return <ToastNotice message={message} onDismiss={() => onDismiss("")} />;
}
