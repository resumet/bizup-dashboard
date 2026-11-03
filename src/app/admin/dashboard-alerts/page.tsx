import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BrandHomeLink } from "@/components/layout/brand-home-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { calendarContext } from "@/lib/shared-calendar/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DashboardAlertCompletions } from "@/components/admin/dashboard-alert-completions";

export default async function DashboardAlertsPage() {
  const context = await calendarContext(true).catch(() => null);
  if (!context) redirect("/login");
  if (!context.isAdmin) notFound();
  const { data } = await createAdminClient().from("dashboard_preparation_alert_completions").select("id,title,description,due_date,completed_at").eq("workspace_id", context.workspaceId).order("completed_at", { ascending: false }).limit(10);
  const items = (data ?? []).map((item) => ({ id: item.id, title: item.title, description: item.description, dueDate: item.due_date, completedAt: item.completed_at }));
  return <main className="min-h-screen bg-muted/30"><header className="border-b bg-background"><div className="mx-auto flex min-h-16 max-w-[1400px] items-center justify-between px-5"><BrandHomeLink /><Link href="/admin" className="text-sm font-medium hover:underline">관리자 메뉴</Link></div></header><div className="mx-auto max-w-[1400px] px-5 py-8"><Card><CardHeader><CardTitle>완료된 사전 준비 알림</CardTitle></CardHeader><CardContent><DashboardAlertCompletions initialItems={items} /></CardContent></Card></div></main>;
}
