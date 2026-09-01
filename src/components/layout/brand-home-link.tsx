import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function BrandHomeLink({
  className,
  showName = true,
}: {
  className?: string;
  showName?: boolean;
}) {
  return (
    <Link
      href="/"
      className={cn(
        "flex shrink-0 items-center gap-2 font-semibold tracking-tight",
        className,
      )}
      aria-label="BizUp 서비스 홈"
    >
      <Image
        src="/brand/bizup-mark.jpg"
        alt=""
        width={36}
        height={36}
        unoptimized
        className="size-9 rounded-xl"
      />
      {showName ? <span className="text-lg">BIZUP</span> : null}
    </Link>
  );
}
