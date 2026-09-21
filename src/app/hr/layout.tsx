import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function HrLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  return <main className="min-h-screen bg-slate-50/60"><header className="border-b bg-background"><div className="mx-auto flex min-h-16 max-w-[1600px] flex-wrap items-center justify-between gap-3 px-5 py-3 lg:px-8"><div className="flex items-center"><Link href="/work" className="font-semibold">운영 워크스페이스</Link><span className="mx-3 text-muted-foreground">/</span><span>HR</span></div><nav className="flex items-center gap-1" aria-label="HR 메뉴"><Link href="/hr" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">업무</Link><Link href="/hr/leave" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted">휴가 관리</Link></nav></div></header>{children}</main>;
}
