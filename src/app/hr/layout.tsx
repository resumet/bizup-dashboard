import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function HrLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  return <main className="min-h-screen bg-slate-50/60"><header className="border-b bg-background"><div className="mx-auto flex h-16 max-w-[1600px] items-center px-5 lg:px-8"><Link href="/work" className="font-semibold">운영 워크스페이스</Link><span className="mx-3 text-muted-foreground">/</span><span>HR 업무 대시보드</span></div></header>{children}</main>;
}
