"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { consumeNavigation } from "@/lib/performance/client-navigation";

export function NavigationPerformanceReporter() {
  const pathname = usePathname();

  useEffect(() => {
    const navigation = consumeNavigation();
    if (!navigation) return;

    const durationMs = Math.round(performance.now() - navigation.startedAt);
    const metric = {
      event: "client_navigation",
      from: navigation.from,
      to: pathname,
      requestedUrl: navigation.url,
      navigationType: navigation.navigationType,
      durationMs,
    };
    console.info("[performance]", metric);
    void fetch("/api/performance/navigation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metric),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
