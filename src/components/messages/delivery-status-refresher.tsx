"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function DeliveryStatusRefresher({
  endpoints,
}: {
  endpoints: string[];
}) {
  const router = useRouter();
  const endpointKey = endpoints.join("|");

  useEffect(() => {
    if (!endpointKey) return;
    const targets = endpointKey.split("|").filter(Boolean);
    let syncing = false;
    const sync = async () => {
      if (syncing) return;
      syncing = true;
      try {
        await Promise.allSettled(
          targets.map((endpoint) => fetch(endpoint, { method: "POST" })),
        );
        router.refresh();
      } finally {
        syncing = false;
      }
    };
    const timer = window.setInterval(sync, 5_000);
    return () => window.clearInterval(timer);
  }, [endpointKey, router]);

  return null;
}
