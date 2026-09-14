"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { HrProvider, useHrQuery } from "./shared";
import type { HrContext, Employee } from "@/lib/hr/types";
import { UserAccountMenu } from "@/components/auth/user-account-menu";

export function HrShell({ context, directory, children }: { context: HrContext; directory: Employee[]; children: ReactNode }) {
  const pathname = usePathname(); const { data } = useHrQuery<HrContext>("context", {}, true);
  const current = data ?? context;
  const links = [["/hr", "오늘"], ...(current.me.role === "admin" ? [["/hr/admin", "관리자"]] : []), ["/hr/tasks", "업무"], ["/hr/leaves", "휴가"], ["/hr/records", "내 기록"]];
  return <HrProvider value={{ ...current, directory }}><div className="min-h-screen bg-slate-50">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <div><Link href="/" className="flex items-center gap-1 text-xs text-muted-foreground"><ChevronLeft className="size-3" /> 공간 선택</Link><Link href="/hr" className="mt-1 block text-xl font-semibold">BIZUP <span className="text-emerald-700">HR</span></Link></div>
      <div className="flex items-center gap-3"><Link href="/hr/notifications" className="flex min-h-11 items-center gap-1 rounded-md border px-3 text-sm" aria-label={`알림 ${current.unread}개 읽지 않음`}><Bell className="size-4" /><span>{current.unread}</span></Link><Link href="/hr/profile" className="text-sm">{current.me.name}</Link><UserAccountMenu email={current.me.email ?? ""} /></div>
    </div><nav aria-label="HR 메뉴" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">{links.map(([href,label]) => <Link key={href} href={href} aria-current={pathname === href || href !== "/hr" && pathname.startsWith(href) ? "page" : undefined} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium ${pathname === href || href !== "/hr" && pathname.startsWith(href) ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-600"}`}>{label}</Link>)}</nav></header>
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-6">{children}</main>
  </div></HrProvider>;
}
