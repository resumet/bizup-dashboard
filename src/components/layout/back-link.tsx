"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

type BackLinkProps = ComponentProps<typeof Link>;

export function BackLink({ onClick, target, ...props }: BackLinkProps) {
  const router = useRouter();

  return <Link
    {...props}
    target={target}
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
  />;
}
