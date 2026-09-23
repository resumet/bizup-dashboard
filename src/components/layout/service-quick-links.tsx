"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { CourseShortcutsMenu } from "@/components/layout/course-shortcuts-menu";
import { Button } from "@/components/ui/button";

const SERVICE_LINKS = [
  { label: "대시보드", href: "/work" },
  { label: "강의운영", href: "/services/course-operations" },
  { label: "일정 플래너", href: "/services/course-schedule-planner" },
  { label: "수강생 명단", href: "/services/course-roster" },
  { label: "전화세일즈", href: "/services/phone-sales-list" },
  { label: "알림톡/문자", href: "/services/message-automation" },
  { label: "자금 흐름", href: "/services/cash-flow" },
] as const;

const AD_PERFORMANCE_ROUTE = "/services/ad-performance";
const COURSE_OPERATIONS_ROUTE = "/services/course-operations";

export function ServiceQuickLinks({
  email,
  hiddenRoutes,
}: {
  email: string;
  hiddenRoutes: string[];
}) {
  const pathname = usePathname();
  const hiddenRouteSet = new Set(hiddenRoutes);
  const isAdPerformance = pathname.startsWith(AD_PERFORMANCE_ROUTE);
  const visibleServiceLinks = SERVICE_LINKS.filter(
    (service) => service.href === "/work" || !hiddenRouteSet.has(service.href),
  );
  const showCourseShortcuts =
    !isAdPerformance && !hiddenRouteSet.has(COURSE_OPERATIONS_ROUTE);

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex min-h-14 max-w-[1600px] items-center gap-3 px-5 lg:px-8">
        <BrandHomeLink showName={false} />
        <div className="h-5 w-px shrink-0 bg-border" />
        <nav
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-2"
          aria-label="서비스 바로가기"
        >
          {showCourseShortcuts ? <CourseShortcutsMenu /> : null}
          {visibleServiceLinks.map((service) => {
            if (isAdPerformance && service.href !== "/work") return null;

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
        <UserAccountMenu email={email} />
      </div>
    </header>
  );
}
