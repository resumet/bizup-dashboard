"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminManagementButton } from "@/components/admin/admin-management-button";
import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { Button } from "@/components/ui/button";

const SERVICE_LINKS = [
  { label: "강의운영", href: "/services/course-operations" },
  { label: "수강생 명단", href: "/services/course-roster" },
  { label: "전화세일즈", href: "/services/phone-sales-list" },
  { label: "알림톡/문자", href: "/services/message-automation" },
  { label: "플친소재", href: "/services/kakao-ad-maker" },
] as const;

export function ServiceQuickLinks({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex min-h-14 max-w-[1600px] items-center gap-3 px-5 lg:px-8">
        <BrandHomeLink showName={false} />
        <div className="h-5 w-px shrink-0 bg-border" />
        <nav
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-2"
          aria-label="서비스 바로가기"
        >
          {SERVICE_LINKS.map((service) => {
            const current = pathname.startsWith(service.href);
            return (
              <Button
                key={service.href}
                variant={current ? "secondary" : "ghost"}
                size="sm"
                className="shrink-0"
                asChild
              >
                <Link
                  href={service.href}
                  aria-current={current ? "page" : undefined}
                >
                  {service.label}
                </Link>
              </Button>
            );
          })}
        </nav>
        <AdminManagementButton email={email} />
        <UserAccountMenu email={email} />
      </div>
    </header>
  );
}
