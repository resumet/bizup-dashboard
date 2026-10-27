"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  BarChart3,
  BookOpenCheck,
  BriefcaseBusiness,
  ChevronRight,
  GripVertical,
  Menu,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { UserAccountMenu } from "@/components/auth/user-account-menu";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  clampSidebarWidth,
} from "@/lib/layout/sidebar-preferences";
import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH_STORAGE_KEY = "bizup:sidebar-width";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "bizup:sidebar-collapsed";

type NavigationItem = {
  label: string;
  href: string;
  exact?: boolean;
};

type NavigationGroup = {
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
};

const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    label: "강의 운영",
    icon: BookOpenCheck,
    items: [
      { label: "진행중 강의 보기", href: "/services/course-operations", exact: true },
      { label: "강사 인스타그램 관리", href: "/services/instagram-management" },
      { label: "유튜브 출연 관리", href: "/services/youtube-management" },
      { label: "강의별 해야할일", href: "/services/course-wbs" },
      { label: "라이브 웨비나", href: "/services/course-webinars" },
      { label: "유튜브 채널 관리", href: "/services/youtube-channels" },
    ],
  },
  {
    label: "성과 · 재무",
    icon: BarChart3,
    items: [
      { label: "광고성과", href: "/services/ad-performance" },
      { label: "입출금 장부", href: "/services/cash-ledger" },
    ],
  },
  {
    label: "명단 · 메시지",
    icon: Users,
    items: [
      { label: "수강생 관리 및 정산", href: "/services/course-operations/students-settlements" },
      { label: "수강생 명단 분석", href: "/services/course-roster" },
      { label: "주소록 매니저", href: "/services/address-books" },
      { label: "전화 세일즈 명단", href: "/services/phone-sales-list" },
      { label: "알림톡 · 문자 자동화", href: "/services/message-automation" },
    ],
  },
  {
    label: "업무 관리",
    icon: BriefcaseBusiness,
    items: [
      { label: "팀 업무", href: "/hr", exact: true },
      { label: "근태 관리", href: "/hr/leave" },
      { label: "비품 신청", href: "/hr/supplies" },
      { label: "공용 캘린더", href: "/calendar" },
    ],
  },
  {
    label: "외부 마케팅 대행",
    icon: MonitorPlay,
    items: [{ label: "외부 마케팅", href: "/services/external-marketing" }],
  },
  {
    label: "도구",
    icon: Puzzle,
    items: [
      { label: "강의 일정 플래너", href: "/services/course-schedule-planner" },
      { label: "수강생 명단 중복 검사", href: "/services/roster-duplicates" },
      { label: "결제자 · 수강생 비교", href: "/services/roster-comparison" },
      { label: "강의 정산 계산기", href: "/tools/settlement-calculator" },
      { label: "연락처 CSV 추출", href: "/services/contact-csv" },
      { label: "유튜브 영상 다운로드", href: "/services/youtube-download" },
      { label: "노바 정산서 검증", href: "/services/nova-settlement-validator" },
      { label: "부가 기능 전체보기", href: "/extras" },
    ],
  },
];

const PRIVATE_ROUTES = ["/work", "/hr", "/calendar", "/extras", "/admin", "/services", "/tools"];

function isPrivateRoute(pathname: string) {
  return pathname === "/" || PRIVATE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isActive(pathname: string, item: NavigationItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function SidebarLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavigationItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 text-[0.82rem] leading-5 transition-colors",
        active
          ? "bg-white text-slate-950 shadow-sm"
          : "text-slate-300 hover:bg-white/8 hover:text-white",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-slate-600 transition-colors",
          active ? "bg-blue-600" : "group-hover:bg-slate-300",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {active ? <ChevronRight className="size-3.5 shrink-0 text-blue-600" aria-hidden="true" /> : null}
    </Link>
  );
}

function SidebarContent({
  email,
  userName,
  isSuperAdmin,
  pathname,
  onNavigate,
}: {
  email: string;
  userName: string;
  isSuperAdmin: boolean;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-white">
      <div className="flex h-20 shrink-0 items-center border-b border-white/10 px-5">
        <BrandHomeLink className="text-white" />
      </div>
      <nav
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="전체 메뉴"
      >
        <div className="space-y-5">
          {NAVIGATION_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <section key={group.label} aria-labelledby={`nav-${group.label}`}>
                <h2
                  id={`nav-${group.label}`}
                  className="flex items-center gap-2 px-3 pb-1.5 text-[0.68rem] font-semibold tracking-[0.12em] text-slate-500 uppercase"
                >
                  <GroupIcon className="size-3.5" aria-hidden="true" />
                  {group.label}
                </h2>
                <div className="space-y-0.5 border-l border-white/10 pl-2">
                  {group.items.map((item) => (
                    <SidebarLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      onNavigate={onNavigate}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          {isSuperAdmin ? (
            <section aria-labelledby="nav-admin">
              <h2 id="nav-admin" className="flex items-center gap-2 px-3 pb-1.5 text-[0.68rem] font-semibold tracking-[0.12em] text-slate-500 uppercase">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                관리자
              </h2>
              <div className="border-l border-white/10 pl-2">
                <SidebarLink item={{ label: "관리자 설정", href: "/admin", exact: true }} pathname={pathname} onNavigate={onNavigate} />
                <SidebarLink item={{ label: "임직원 관리", href: "/hr/personnel" }} pathname={pathname} onNavigate={onNavigate} />
                <SidebarLink item={{ label: "비품 관리", href: "/admin/supplies" }} pathname={pathname} onNavigate={onNavigate} />
                <SidebarLink item={{ label: "캘린더 항목 관리", href: "/admin/calendar" }} pathname={pathname} onNavigate={onNavigate} />
              </div>
            </section>
          ) : null}
        </div>
      </nav>
      <div className="shrink-0 border-t border-white/10 p-3 [&_button]:text-slate-200 [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
        <UserAccountMenu email={email} name={userName} showDetailLabel />
      </div>
    </div>
  );
}

export function AppShell({
  children,
  email,
  userName,
  isSuperAdmin,
}: {
  children: ReactNode;
  email: string | null;
  userName: string;
  isSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPreferencesLoaded, setSidebarPreferencesLoaded] = useState(false);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const resizeStart = useRef({ pointerX: 0, width: DEFAULT_SIDEBAR_WIDTH });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const storedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
        const storedCollapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);

        if (storedWidth) setSidebarWidth(clampSidebarWidth(storedWidth));
        if (storedCollapsed !== null) setSidebarCollapsed(storedCollapsed === "true");
      } catch {
        // Fall back to the default state when browser storage is unavailable.
      } finally {
        setSidebarPreferencesLoaded(true);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!sidebarPreferencesLoaded) return;
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // The controls still work for this visit when browser storage is unavailable.
    }
  }, [sidebarCollapsed, sidebarPreferencesLoaded, sidebarWidth]);

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => !collapsed);
  }

  function startSidebarResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    resizeStart.current = { pointerX: event.clientX, width: sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizingSidebar(true);
  }

  function resizeSidebar(event: PointerEvent<HTMLDivElement>) {
    if (!resizingSidebar) return;
    const nextWidth = resizeStart.current.width + event.clientX - resizeStart.current.pointerX;
    setSidebarWidth(clampSidebarWidth(nextWidth));
  }

  function finishSidebarResize(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setResizingSidebar(false);
  }

  function resizeSidebarWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 32 : 12;
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = sidebarWidth - step;
    if (event.key === "ArrowRight") nextWidth = sidebarWidth + step;
    if (event.key === "Home") nextWidth = MIN_SIDEBAR_WIDTH;
    if (event.key === "End") nextWidth = MAX_SIDEBAR_WIDTH;
    if (nextWidth === null) return;
    event.preventDefault();
    setSidebarWidth(clampSidebarWidth(nextWidth));
  }

  if (!email || !isPrivateRoute(pathname)) return children;

  const shellStyle = { "--app-sidebar-width": `${sidebarWidth}px` } as CSSProperties;

  return (
    <div className={cn("min-h-dvh bg-slate-50", resizingSidebar && "cursor-col-resize select-none")} style={shellStyle}>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-(--app-sidebar-width) lg:block",
          !resizingSidebar && "transition-transform duration-200 ease-out",
          sidebarCollapsed && "pointer-events-none -translate-x-full",
        )}
        aria-hidden={sidebarCollapsed}
        inert={sidebarCollapsed}
      >
        <SidebarContent email={email} userName={userName} isSuperAdmin={isSuperAdmin} pathname={pathname} onNavigate={() => undefined} />
        <div
          role="separator"
          aria-label="사이드바 너비 조절"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          tabIndex={sidebarCollapsed ? -1 : 0}
          title="드래그하여 폭 조절 · 더블클릭하여 기본 폭"
          className="group absolute inset-y-0 -right-2 z-10 flex w-4 cursor-col-resize touch-none items-center justify-center outline-none"
          onPointerDown={startSidebarResize}
          onPointerMove={resizeSidebar}
          onPointerUp={finishSidebarResize}
          onPointerCancel={finishSidebarResize}
          onDoubleClick={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
          onKeyDown={resizeSidebarWithKeyboard}
        >
          <span className="grid h-12 w-3 place-items-center rounded-full border border-slate-700 bg-slate-900 text-slate-500 shadow-sm transition-colors group-hover:border-slate-500 group-hover:text-slate-200 group-focus-visible:ring-2 group-focus-visible:ring-blue-500 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-slate-950">
            <GripVertical className="size-3" aria-hidden="true" />
          </span>
        </div>
      </aside>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className={cn(
          "fixed top-5 z-50 hidden size-9 rounded-lg border-slate-300 bg-white text-slate-700 shadow-md transition-[left,transform,background-color] duration-200 hover:bg-slate-100 lg:inline-flex",
          sidebarCollapsed ? "left-3" : "left-[calc(var(--app-sidebar-width)-2.75rem)] border-white/15 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white",
        )}
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
        aria-expanded={!sidebarCollapsed}
        title={sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}
      >
        {sidebarCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
      </Button>

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-white/95 px-4 backdrop-blur lg:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="전체 메뉴 열기"
        >
          <Menu />
        </Button>
        <BrandHomeLink showName={false} />
        <span className="truncate text-sm font-semibold">BizUp 대시보드</span>
        <div className="ml-auto"><UserAccountMenu email={email} name={userName} /></div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="전체 메뉴">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/55"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="전체 메뉴 닫기"
          />
          <aside className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] shadow-2xl">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-5 right-3 z-10 text-slate-300 hover:bg-white/10 hover:text-white"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="전체 메뉴 닫기"
            >
              <X />
            </Button>
            <SidebarContent
              email={email}
              userName={userName}
              isSuperAdmin={isSuperAdmin}
              pathname={pathname}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div
        className={cn(
          "min-w-0",
          !resizingSidebar && "transition-[padding] duration-200 ease-out",
          sidebarCollapsed ? "lg:pl-0" : "lg:pl-(--app-sidebar-width)",
        )}
      >
        {children}
      </div>
    </div>
  );
}
