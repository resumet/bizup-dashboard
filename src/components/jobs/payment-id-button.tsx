"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PaymentIdButton({ value, name }: { value?: string; name: string }) {
  const [visible, setVisible] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <div className="flex items-center gap-2">
    {visible && <span className="max-w-64 break-all whitespace-normal font-mono text-xs">{value}</span>}
    <Button type="button" size="sm" variant="outline" aria-label={`${name || "수강생"} 결제ID ${visible ? "숨기기" : "보기"}`} aria-expanded={visible} onClick={() => setVisible(!visible)}>
      {visible ? "숨기기" : "보기"}
    </Button>
  </div>;
}
