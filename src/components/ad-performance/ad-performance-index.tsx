"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, BookOpenCheck, Copy, ExternalLink, ImageIcon, Loader2, MoreHorizontal, Plus, Save, Settings2, Trash2 } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToastNotice } from "@/components/ui/toast";
import { formatWebinarDate, getWebinarDayDifference } from "@/lib/course-operations/webinar-proximity";
import type { AdPerformanceDashboardSummary, AdPerformanceIndexData } from "@/lib/ad-performance/types";

const number = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const todayKoreaDate = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

function formatDday(webinarDate: string | undefined) {
  const days = getWebinarDayDifference(webinarDate ?? "", todayKoreaDate);
  if (days === null) return "-";
  if (days > 0) return `D-${days}`;
  if (days === 0) return "D-Day";
  return `D+${Math.abs(days)}`;
}

function DashboardRow({ dashboard, busy, onDelete }: {
  dashboard: AdPerformanceDashboardSummary;
  busy: boolean;
  onDelete: () => void;
}) {
  const courseName = dashboard.course?.name ?? "강의 미설정";
  const landingLeadCost = dashboard.paidLandingLeads > 0 ? dashboard.spend / dashboard.paidLandingLeads : null;
  return <TableRow>
    <TableCell className="max-w-56 font-medium whitespace-normal">{courseName}</TableCell>
    <TableCell>{dashboard.course?.instructorName || "-"}</TableCell>
    <TableCell className="tabular-nums">{formatWebinarDate(dashboard.course?.freeWebinarAt)}</TableCell>
    <TableCell className="tabular-nums">{formatDday(dashboard.course?.freeWebinarAt)}</TableCell>
    <TableCell className="tabular-nums">{dashboard.startDate}</TableCell>
    <TableCell className="tabular-nums">{won.format(dashboard.spend)}</TableCell>
    <TableCell className="tabular-nums">{number.format(dashboard.metricCount)}일</TableCell>
    <TableCell className="tabular-nums">{number.format(dashboard.paidLandingLeads + dashboard.organicLandingLeads)}건</TableCell>
    <TableCell className="tabular-nums">{dashboard.chatRoomMembers === null ? "-" : `${number.format(dashboard.chatRoomMembers)}명`}</TableCell>
    <TableCell className="tabular-nums">{landingLeadCost === null ? "-" : won.format(Math.round(landingLeadCost))}</TableCell>
    <TableCell><Button asChild size="icon-sm" aria-label={`${courseName} 광고성과`} title="광고성과"><Link href={`/services/ad-performance/${dashboard.id}`}><BarChart3 /></Link></Button></TableCell>
    <TableCell><Button asChild size="icon-sm" variant="outline" aria-label="전체 소재성과" title="전체 소재성과"><Link href="/services/ad-performance/creative"><ImageIcon /></Link></Button></TableCell>
    <TableCell><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" size="icon-sm" variant="ghost" disabled={busy} aria-label={`${courseName} 메뉴`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" disabled={busy} onSelect={onDelete}><Trash2 />삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell>
  </TableRow>;
}

export function AdPerformanceIndex({ initialData }: { initialData: AdPerformanceIndexData }) {
  const router = useRouter();
  const [dashboards, setDashboards] = useState(initialData.dashboards);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState(initialData.loadError ?? "");
  const [creativeSource, setCreativeSource] = useState(initialData.creativeSource);
  const [sourceSettingsOpen, setSourceSettingsOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(initialData.creativeSource.url);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [notice, setNotice] = useState("");

  function openSourceSettings() {
    setSourceUrl(creativeSource.url);
    setSourceError("");
    setSourceSettingsOpen(true);
  }

  async function saveCreativeSource() {
    if (sourceSaving) return;
    setSourceSaving(true);
    setSourceError("");
    try {
      const response = await fetch("/api/ad-creative", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sourceUrl, webinarName: creativeSource.webinarName, expectedUpdatedAt: creativeSource.updatedAt }),
      });
      const result = await response.json() as { url?: string; updatedAt?: string; webinarName?: string; rows?: unknown[]; message?: string };
      if (!response.ok || !result.url || !result.updatedAt || result.webinarName === undefined) throw new Error(result.message || "원본 데이터를 저장하지 못했습니다.");
      setCreativeSource({ url: result.url, updatedAt: result.updatedAt, webinarName: result.webinarName });
      setSourceSettingsOpen(false);
      setNotice(`${(result.rows?.length ?? 0).toLocaleString("ko-KR")}건의 소재성과 데이터를 불러왔습니다.`);
    } catch (caught) {
      setSourceError(caught instanceof Error ? caught.message : "원본 데이터를 저장하지 못했습니다.");
    } finally {
      setSourceSaving(false);
    }
  }

  function openSourceInNewWindow() {
    try {
      const url = new URL(sourceUrl.trim());
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("INVALID_URL");
      window.open(url.href, "_blank", "noopener,noreferrer");
    } catch {
      setSourceError("유효한 Google Sheets 주소를 입력해 주세요.");
    }
  }

  async function copySourceUrl() {
    if (!sourceUrl.trim()) return;
    try {
      await navigator.clipboard.writeText(sourceUrl.trim());
      setNotice("Google Sheets 주소를 복사했습니다.");
    } catch {
      setSourceError("주소를 복사하지 못했습니다. 직접 선택해 복사해 주세요.");
    }
  }

  async function createDashboard() {
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/ad-performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
    if (!window.confirm(`${dashboard.course?.name ?? "강의 미설정"} 광고성과 대시보드와 날짜별 기록을 모두 삭제할까요?`)) return;
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

  return <main className="min-h-screen">
    <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild><BackLink href="/work"><ArrowLeft />뒤로가기</BackLink></Button>
        <h1 className="text-3xl font-semibold tracking-tight">내부광고 성과기록</h1>
      </div>
      {error ? <Alert variant="destructive" className="mt-6"><AlertTriangle /><AlertTitle>확인이 필요합니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      <ToastNotice message={notice} onDismiss={() => setNotice("")} />

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={openSourceSettings}><Settings2 />원본 데이터 설정</Button>
        <Button variant="outline" asChild><Link href="/services/ad-performance/bulk">일괄 보기</Link></Button>
        <Button className="min-h-10" disabled={creating || Boolean(initialData.loadError)} onClick={() => void createDashboard()}>{creating ? <Loader2 className="animate-spin" /> : <Plus />}대시보드 만들기</Button>
      </div>

      <section className="mt-8">
        {dashboards.length ? <div className="rounded-xl border"><Table><TableHeader><TableRow>
          {['강의명', '강사명', '웨비나 날짜', 'D-며칠', '광고 시작 날짜', '누적 집행비', '기록 일수', 'DB 총합', '단톡방 총합', '랜딩접수DB 단가', '광고성과', '소재성과'].map((label) => <TableHead key={label}>{label}</TableHead>)}<TableHead><span className="sr-only">관리</span></TableHead>
        </TableRow></TableHeader><TableBody>{dashboards.map((dashboard) => <DashboardRow key={dashboard.id} dashboard={dashboard} busy={deletingId === dashboard.id} onDelete={() => void deleteDashboard(dashboard)} />)}</TableBody></Table></div> : (
          <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><BookOpenCheck className="size-5" /></span><h3 className="font-semibold">아직 광고성과 대시보드가 없습니다</h3><p className="mt-2 max-w-md text-sm text-muted-foreground">대시보드를 만든 뒤 사전설정에서 강의와 광고 조건을 선택하세요.</p></CardContent></Card>
        )}
      </section>
      <Dialog open={sourceSettingsOpen} onOpenChange={(open) => { if (!sourceSaving) setSourceSettingsOpen(open); }}>
        <DialogContent className="sm:max-w-xl" showCloseButton={!sourceSaving}>
          <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void saveCreativeSource(); }}>
            <DialogHeader><DialogTitle>원본 데이터 설정</DialogTitle></DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="creative-source">Google Sheets 주소</Label>
              <Input id="creative-source" type="url" required value={sourceUrl} disabled={sourceSaving} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/d/.../edit" />
              <p className="text-xs leading-5 text-muted-foreground">google_raw와 meta_raw 시트를 포함한 Google Sheets 주소를 입력하세요.</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={sourceSaving || !sourceUrl.trim()} onClick={openSourceInNewWindow}><ExternalLink />새 창으로 열기</Button>
                <Button type="button" variant="outline" disabled={sourceSaving || !sourceUrl.trim()} onClick={() => void copySourceUrl()}><Copy />주소 복사</Button>
              </div>
            </div>
            {sourceError ? <p role="alert" className="text-sm text-destructive">{sourceError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" disabled={sourceSaving} onClick={() => setSourceSettingsOpen(false)}>취소</Button><Button type="submit" disabled={sourceSaving}>{sourceSaving ? <Loader2 className="animate-spin" /> : <Save />}{sourceSaving ? "불러오는 중" : "저장하고 불러오기"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </main>;
}
