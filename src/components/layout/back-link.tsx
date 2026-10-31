"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

type BackLinkProps = ComponentProps<typeof Link>;

export function BackLink({ children, className, onClick, target, title, ...props }: BackLinkProps) {
  const accessibleLabel = props["aria-label"] ?? "돌아가기";

  return <Link
    {...props}
    aria-label={accessibleLabel}
    className={cn(className, "size-9 gap-0 p-0")}
    target={target}
    title={title ?? accessibleLabel}
    onClick={onClick}
  >
    <ArrowLeft className="size-4" aria-hidden="true" />
    <span className="sr-only" aria-hidden="true">{children}</span>
  </Link>;
}
