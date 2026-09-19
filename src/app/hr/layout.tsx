import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function HrLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser(await createClient());
  if (!user) redirect("/login");
  return <main className="min-h-screen"><header className="border-b bg-background"><div className="mx-auto flex h-16 max-w-6xl items-center px-5"><Link href="/work" className="font-semibold">운영 워크스페이스</Link><span className="mx-3 text-muted-foreground">/</span><span>새 HR 업무</span></div></header>{children}</main>;
}
