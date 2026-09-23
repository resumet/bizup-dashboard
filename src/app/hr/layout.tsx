import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { HrHeader } from "@/components/hr/hr-header";
import { requireWorkTaskContext } from "@/lib/work-tasks/server";

export default async function HrLayout({ children }: { children: ReactNode }) {
  let context;
  try { context = await requireWorkTaskContext(); }
  catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof Error && error.message === "PERSONNEL_INACTIVE") return <main className="mx-auto max-w-xl space-y-4 p-8"><h1 className="text-xl font-semibold">이용 권한이 없습니다.</h1><p>퇴직 처리된 계정입니다.</p><Link href="/" className="underline">공간 선택</Link></main>;
    throw error;
  }
  return (
    <main className="min-h-screen bg-slate-50/60">
      <HrHeader
        email={context.user.email ?? "이메일 정보 없음"}
        isSuperAdmin={context.isSuperAdmin}
      />
      {children}
    </main>
  );
}
