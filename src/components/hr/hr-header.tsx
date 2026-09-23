"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";

import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { Button } from "@/components/ui/button";

function getMenuName(pathname: string) {
  if (pathname === "/hr/leave" || pathname.startsWith("/hr/leave/")) {
    return "근태관리";
  }
  if (pathname === "/hr/personnel" || pathname.startsWith("/hr/personnel/")) {
    return "임직원관리";
  }
  return "업무관리";
}

export function HrHeader({
  email,
  isSuperAdmin,
}: {
  email: string;
  isSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const menuName = getMenuName(pathname);
  const showPersonnelButton = isSuperAdmin && menuName === "근태관리";

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-18 max-w-[1600px] items-center justify-between gap-4 px-5 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <BrandHomeLink showName={false} />
          <div className="h-5 w-px shrink-0 bg-border" />
          <span className="truncate font-semibold">{menuName}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {showPersonnelButton ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/hr/personnel">
                <Users />
                임직원관리
              </Link>
            </Button>
          ) : null}
          <UserAccountMenu email={email} />
        </div>
      </div>
    </header>
  );
}
