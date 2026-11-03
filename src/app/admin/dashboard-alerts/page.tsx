import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarContext } from "@/lib/shared-calendar/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function DashboardAlertsPage() {
  const context = await calendarContext(true).catch(() => null);
  if (!context) redirect("/login");
  if (!context.isAdmin) notFound();
  const { data } = await createAdminClient().from("dashboard_preparation_alert_completions").select("id,title,description,due_date,completed_at").eq("workspace_id", context.workspaceId).order("completed_at", { ascending: false }).limit(500);
  return <main className="min-h-screen bg-muted/30"><header className="border-b bg-background"><div className="mx-auto flex min-h-16 max-w-[1400px] items-center justify-between px-5"><BrandHomeLink /><Link href="/admin" className="text-sm font-medium hover:underline">관리자 메뉴</Link></div></header><div className="mx-auto max-w-[1400px] px-5 py-8"><Card><CardHeader><CardTitle>완료된 사전 준비 알림</CardTitle></CardHeader><CardContent>{data?.length ? <div className="space-y-3">{data.map((item) => <article key={item.id} className="rounded-lg border p-3"><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.description}</p><p className="mt-1 text-xs text-muted-foreground">기준일 {item.due_date} · 완료 {new Date(item.completed_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p></article>)}</div> : <p className="text-sm text-muted-foreground">완료된 알림이 없습니다.</p>}</CardContent></Card></div></main>;
}
