import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireWorkTaskContext } from "@/lib/work-tasks/server";

export default async function HrLayout({ children }: { children: ReactNode }) {
  let context;
  try { context = await requireWorkTaskContext(); }
  catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof Error && error.message === "PERSONNEL_INACTIVE") return <main className="mx-auto max-w-xl space-y-4 p-8"><h1 className="text-xl font-semibold">이용 권한이 없습니다.</h1><p>퇴직 처리된 계정입니다.</p><Link href="/" className="underline">공간 선택</Link></main>;
    throw error;
  }
  return <main className="min-h-screen bg-slate-50/60"><header className="border-b bg-background"><div className="mx-auto flex min-h-16 max-w-[1600px] flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-8"><div className="flex items-center"><Link href="/" className="font-semibold">공간 선택</Link><span className="mx-3 text-muted-foreground">/</span><span>업무·근태</span></div><nav className="flex flex-wrap items-center gap-1" aria-label="업무·근태 메뉴"><Link href="/hr" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">업무관리</Link><Link href="/hr/leave" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">근태관리</Link>{context.isSuperAdmin && <Link href="/hr/personnel" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">임직원 관리</Link>}</nav></div></header>{children}</main>;
}
