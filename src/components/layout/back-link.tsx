"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

type BackLinkProps = ComponentProps<typeof Link>;

export function BackLink({ children, className, onClick, target, title, ...props }: BackLinkProps) {
  const router = useRouter();
  const accessibleLabel = props["aria-label"] ?? "돌아가기";

  return <Link
    {...props}
    aria-label={accessibleLabel}
    className={cn(className, "size-9 gap-0 p-0")}
    target={target}
    title={title ?? accessibleLabel}
    onClick={(event) => {
      onClick?.(event);
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
        (target && target !== "_self") ||
        window.history.length <= 1
      ) return;

      event.preventDefault();
      router.back();
    }}
  >
    <ArrowLeft className="size-4" aria-hidden="true" />
    <span className="sr-only" aria-hidden="true">{children}</span>
  </Link>;
}
