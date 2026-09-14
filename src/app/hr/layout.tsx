import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { hrQuery, HrError } from "@/lib/hr/server";
import type { HrContext, Employee } from "@/lib/hr/types";
import { HrShell } from "@/components/hr/shell";

export default async function HrLayout({ children }: { children: ReactNode }) {
  let context: HrContext; const directory: Employee[] = [];
  try {
    context = await hrQuery<HrContext>("context");
    for (let page = 0; ; page++) {
      const result = await hrQuery<{ items: Employee[]; total: number }>("directory", { limit: 100, page });
      directory.push(...result.items); if (directory.length >= result.total || !result.items.length) break;
    }
  } catch (error) {
    if (error instanceof HrError && error.status === 401) redirect("/login");
    return <main className="mx-auto max-w-lg px-5 py-20"><h1 className="text-2xl font-semibold">HR 이용 안내</h1><p className="my-5 text-muted-foreground">{error instanceof HrError ? error.message : "HR에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."}</p><Link className="underline" href="/">공간 선택으로 돌아가기</Link></main>;
  }
  return <HrShell context={context} directory={directory}>{children}</HrShell>;
}
