"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, BarChart3, BookOpenCheck, CalendarDays, Loader2, Plus, Trash2, WalletCards } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdPerformanceDashboardSummary, AdPerformanceIndexData } from "@/lib/ad-performance/types";

const number = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });

function todayInSeoul() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/\D/gu, ""));
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function DashboardCard({ dashboard, busy, onDelete }: {
  dashboard: AdPerformanceDashboardSummary;
  busy: boolean;
  onDelete: () => void;
}) {
  const remaining = dashboard.totalBudget - dashboard.spend;
  return (
    <Card className="group overflow-hidden transition hover:border-primary/40 hover:shadow-md">
      <CardHeader className="border-b bg-muted/25">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant="secondary">{dashboard.course.instructorName || "강사 미지정"}</Badge>
            <CardTitle className="mt-3 truncate text-xl">{dashboard.course.name}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1.5"><CalendarDays className="size-3.5" />광고 시작 {dashboard.startDate}</CardDescription>
          </div>
          <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={`${dashboard.course.name} 광고성과 삭제`} onClick={onDelete}><Trash2 className="text-destructive" /></Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 pt-5">
        <div><p className="text-xs text-muted-foreground">총예산</p><p className="mt-1 font-semibold tabular-nums">{won.format(dashboard.totalBudget)}</p></div>
        <div><p className="text-xs text-muted-foreground">누적 집행비</p><p className="mt-1 font-semibold tabular-nums">{won.format(dashboard.spend)}</p></div>
        <div><p className="text-xs text-muted-foreground">남은 예산</p><p className={`mt-1 font-semibold tabular-nums ${remaining < 0 ? "text-destructive" : ""}`}>{won.format(remaining)}</p></div>
        <div><p className="text-xs text-muted-foreground">기록 일수</p><p className="mt-1 font-semibold tabular-nums">{number.format(dashboard.metricCount)}일</p></div>
        <div><p className="text-xs text-muted-foreground">랜딩접수 DB(광고)</p><p className="mt-1 font-semibold tabular-nums">{number.format(dashboard.paidLandingLeads)}건</p></div>
        <div><p className="text-xs text-muted-foreground">랜딩접수 DB(오가닉)</p><p className="mt-1 font-semibold tabular-nums">{number.format(dashboard.organicLandingLeads)}건</p></div>
        <div><p className="text-xs text-muted-foreground">DB 총합</p><p className="mt-1 font-semibold tabular-nums">{number.format(dashboard.paidLandingLeads + dashboard.organicLandingLeads)}건</p></div>
        <div><p className="text-xs text-muted-foreground">어드민 누적 DB</p><p className="mt-1 font-semibold tabular-nums">{number.format(dashboard.adminCumulativeLeads)}건</p></div>
        <Button asChild className="col-span-2 mt-1"><Link href={`/services/ad-performance/${dashboard.id}`}>대시보드 열기 <ArrowRight /></Link></Button>
      </CardContent>
    </Card>
  );
}

export function AdPerformanceIndex({ initialData }: { initialData: AdPerformanceIndexData }) {
  const router = useRouter();
  const [dashboards, setDashboards] = useState(initialData.dashboards);
  const [courseId, setCourseId] = useState("");
  const [startDate, setStartDate] = useState(todayInSeoul());
  const [totalBudget, setTotalBudget] = useState(0);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState(initialData.loadError ?? "");
  const linkedCourseIds = useMemo(() => new Set(dashboards.map((dashboard) => dashboard.course.id)), [dashboards]);
  const availableCourses = useMemo(() => initialData.courses.filter((course) => !linkedCourseIds.has(course.id)), [initialData.courses, linkedCourseIds]);

  async function createDashboard() {
    if (!courseId) return setError("연결할 강의를 선택해 주세요.");
    if (!startDate) return setError("광고 시작일을 선택해 주세요.");
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/ad-performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, startDate, totalBudget }),
      });
      const result = await response.json() as { id?: string; message?: string };
      if (!response.ok || !result.id) throw new Error(result.message || "광고성과 대시보드를 만들지 못했습니다.");
      router.push(`/services/ad-performance/${result.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "광고성과 대시보드를 만들지 못했습니다.");
      setCreating(false);
    }
  }

  async function deleteDashboard(dashboard: AdPerformanceDashboardSummary) {
    if (!window.confirm(`${dashboard.course.name} 광고성과 대시보드와 날짜별 기록을 모두 삭제할까요?`)) return;
    setDeletingId(dashboard.id);
    setError("");
    try {
      const response = await fetch(`/api/ad-performance/${dashboard.id}`, { method: "DELETE" });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "광고성과 대시보드를 삭제하지 못했습니다.");
      setDashboards((current) => current.filter((item) => item.id !== dashboard.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "광고성과 대시보드를 삭제하지 못했습니다.");
    } finally {
      setDeletingId("");
    }
  }

  const totalSpend = dashboards.reduce((sum, dashboard) => sum + dashboard.spend, 0);
  const totalBudgetSum = dashboards.reduce((sum, dashboard) => sum + dashboard.totalBudget, 0);

  return <main className="min-h-screen">
    <div className="mx-auto max-w-[1600px] px-5 py-8 lg:px-8">
      <Button variant="ghost" size="sm" asChild className="mb-5"><Link href="/work"><ArrowLeft />서비스 목록</Link></Button>
      <div><Badge variant="outline" className="mb-3"><BarChart3 />강의별 광고 운영</Badge><h1 className="text-3xl font-semibold tracking-tight">광고성과 대시보드</h1><p className="mt-2 text-muted-foreground">저장된 강의에 광고성과를 연결하고 강의별 집행 현황을 관리합니다.</p></div>

      {error ? <Alert variant="destructive" className="mt-6"><AlertTriangle /><AlertTitle>확인이 필요합니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card><CardHeader><CardDescription>운영 대시보드</CardDescription><CardTitle className="text-3xl tabular-nums">{number.format(dashboards.length)}개</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>전체 광고 예산</CardDescription><CardTitle className="text-3xl tabular-nums">{won.format(totalBudgetSum)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>전체 누적 집행비</CardDescription><CardTitle className="text-3xl tabular-nums">{won.format(totalSpend)}</CardTitle></CardHeader></Card>
      </section>

      <Card className="mt-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="size-5" />새 광고성과 대시보드</CardTitle><CardDescription>저장된 강의 하나를 선택해 광고성과 항목을 만듭니다. 강의당 하나의 대시보드를 만들 수 있습니다.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(16rem,2fr)_minmax(11rem,1fr)_minmax(13rem,1fr)_auto] lg:items-end">
          <div className="space-y-2"><Label>연결할 강의</Label><Select value={courseId} onValueChange={setCourseId} disabled={!availableCourses.length || Boolean(initialData.loadError)}><SelectTrigger className="w-full"><SelectValue placeholder={availableCourses.length ? "강의를 선택하세요" : "연결 가능한 강의가 없습니다"} /></SelectTrigger><SelectContent>{availableCourses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name} · {course.instructorName}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="new-ad-start-date">광고 시작일</Label><Input id="new-ad-start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="new-ad-budget">총예산</Label><div className="relative"><WalletCards className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="new-ad-budget" className="pl-9 text-right tabular-nums" inputMode="numeric" value={totalBudget ? number.format(totalBudget) : ""} placeholder="0" onChange={(event) => setTotalBudget(parseMoney(event.target.value))} /></div></div>
          <Button className="min-h-10" disabled={creating || !availableCourses.length || Boolean(initialData.loadError)} onClick={() => void createDashboard()}>{creating ? <Loader2 className="animate-spin" /> : <Plus />}대시보드 만들기</Button>
        </CardContent>
      </Card>

      <section className="mt-8">
        <div><h2 className="text-xl font-semibold">강의별 광고성과</h2><p className="mt-1 text-sm text-muted-foreground">각 강의의 예산과 누적 성과를 한눈에 확인합니다.</p></div>
        {dashboards.length ? <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{dashboards.map((dashboard) => <DashboardCard key={dashboard.id} dashboard={dashboard} busy={deletingId === dashboard.id} onDelete={() => void deleteDashboard(dashboard)} />)}</div> : (
          <Card className="mt-4"><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><BookOpenCheck className="size-5" /></span><h3 className="font-semibold">아직 광고성과 대시보드가 없습니다</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">위에서 저장된 강의를 선택해 첫 광고성과 대시보드를 만들어 보세요.</p>{!initialData.courses.length ? <Button asChild variant="outline" className="mt-5"><Link href="/services/course-operations/new"><Plus />강의 먼저 만들기</Link></Button> : null}</CardContent></Card>
        )}
      </section>
    </div>
  </main>;
}
