"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Popover } from "radix-ui";
import { Button } from "@/components/ui/button";
import { NotificationFeed, notificationRequest } from "./notification-feed";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const generation = useRef(0);
  const invalidate = useCallback(() => { ++generation.current; }, []);

  const refreshCount = useCallback(async () => {
    const version = ++generation.current;
    try {
      const data = await notificationRequest<{ unreadCount: number }>("/api/notifications?count=1");
      if (version === generation.current) setCount(data.unreadCount);
    } catch { /* Keep the last known count; opening the list offers a retry. */ }
  }, []);

  useEffect(() => {
    const update = () => { if (document.visibilityState === "visible") void refreshCount(); };
    update();
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    const broadcast = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("media-notifications");
    if (broadcast) broadcast.onmessage = update;
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      broadcast?.close();
      invalidate();
    };
  }, [refreshCount, invalidate]);

  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild>
      <Button type="button" variant="ghost" size="icon" className="relative" aria-label={`알림, 읽지 않은 알림 ${count}개`}>
        <Bell className="size-5" />
        {count > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 font-semibold text-white">{count > 99 ? "99+" : count}</span>}
      </Button>
    </Popover.Trigger>
    <Popover.Portal><Popover.Content align="end" sideOffset={8} collisionPadding={12} aria-label="알림 목록" className="z-50 w-[420px] max-w-[calc(100vw-24px)] rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none">
      <NotificationFeed variant="popover" onUnreadCount={setCount} onClose={() => setOpen(false)} />
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
