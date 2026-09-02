"use client";

import { useLinkStatus } from "next/link";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function PendingLinkLabel({
  idle,
  pending,
}: {
  idle: ReactNode;
  pending: ReactNode;
}) {
  const { pending: isPending } = useLinkStatus();

  return isPending ? (
    <>
      <Loader2 className="animate-spin" />
      {pending}
    </>
  ) : (
    idle
  );
}
