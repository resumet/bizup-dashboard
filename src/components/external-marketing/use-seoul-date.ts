"use client";
import { useEffect, useState } from "react";
import { externalMarketingToday } from "@/lib/external-marketing/wbs";

export function useSeoulDate(initialDate: string) {
  const [today, setToday] = useState(initialDate);
  useEffect(() => {
    const refresh = () => setToday(externalMarketingToday());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  return today;
}
