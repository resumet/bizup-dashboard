"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Loader2, Plus, Save, Trash2, WalletCards } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { summarizeAdPerformance } from "@/lib/ad-performance/calculation";
import type { AdPerformanceDailyMetric, AdPerformanceDashboardData } from "@/lib/ad-performance/types";

const number = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
const integerFields: Array<Exclude<keyof AdPerformanceDailyMetric, "metricDate">> = [
  "googleImpressions", "metaImpressions", "googleClicks", "metaClicks",
  "googleAdLeads", "metaAdLeads", "googleSpend", "metaSpend", "landingLeads",
  "googleAdminLeads", "metaAdminLeads",
];

function todayInSeoul() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function emptyMetric(metricDate: string): AdPerformanceDailyMetric {
  return Object.fromEntries([
    ["metricDate", metricDate],
    ...integerFields.map((field) => [field, 0]),
  ]) as AdPerformanceDailyMetric;
}

function parseCount(value: string) {
  const parsed = Number(value.replace(/\D/gu, ""));
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function CountInput({ value, label, onChange, money = false }: { value: number; label: string; onChange: (value: number) => void; money?: boolean }) {
  return <Input className="min-w-24 text-right tabular-nums" inputMode="numeric" aria-label={label} value={value ? number.format(value) : ""} placeholder="0" onChange={(event) => onChange(parseCount(event.target.value))} title={money && value ? won.format(value) : undefined} />;
}

function SummaryCard({ label, value, detail, negative = false }: { label: string; value: string; detail: string; negative?: boolean }) {
  return <Card className={negative ? "border-destructive/40" : undefined}><CardHeader className="gap-2"><CardDescription>{label}</CardDescription><CardTitle className={`text-2xl tabular-nums ${negative ? "text-destructive" : ""}`}>{value}</CardTitle><p className="text-xs text-muted-foreground">{detail}</p></CardHeader></Card>;
}

function rate(value: number | null) {
  return value === null ? "-" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
}

function cost(value: number | null) {
  return value === null ? "-" : won.format(Math.round(value));
}

export function AdPerformanceDashboard({ initialData }: { initialData: AdPerformanceDashboardData }) {
  const [startDate, setStartDate] = useState(initialData.startDate);
  const [totalBudget, setTotalBudget] = useState(initialData.totalBudget);
  const [metrics, setMetrics] = useState(() => [...initialData.metrics].sort((a, b) => a.metricDate.localeCompare(b.metricDate)));
  const [savedDates, setSavedDates] = useState(() => new Set(initialData.metrics.map((metric) => metric.metricDate)));
  const [newMetricDate, setNewMetricDate] = useState(initialData.startDate || todayInSeoul());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(initialData.loadError ?? "");
  const [notice, setNotice] = useState("");
  const summary = useMemo(() => summarizeAdPerformance(metrics, totalBudget), [metrics, totalBudget]);

  function updateMetric(metricDate: string, field: Exclude<keyof AdPerformanceDailyMetric, "metricDate">, value: number) {
    setMetrics((current) => current.map((metric) => metric.metricDate === metricDate ? { ...metric, [field]: value } : metric));
    setNotice("");
  }

  function addMetric() {
    setError("");
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(newMetricDate)) return setError("기록할 날짜를 선택해 주세요.");
    if (startDate && newMetricDate < startDate) return setError("광고 시작일 이전 날짜는 추가할 수 없습니다.");
    if (metrics.some((metric) => metric.metricDate === newMetricDate)) return setError("이미 추가된 날짜입니다.");
    setMetrics((current) => [...current, emptyMetric(newMetricDate)].sort((a, b) => a.metricDate.localeCompare(b.metricDate)));
    setNotice("");
  }

  async function removeMetric(metricDate: string) {
    if (savedDates.has(metricDate)) {
      if (!window.confirm(`${metricDate} 광고성과 기록을 삭제할까요?`)) return;
      setSaving(true);
      setError("");
      try {
        const response = await fetch("/api/ad-performance", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metricDate }),
        });
        const result = await response.json() as { message?: string };
        if (!response.ok) throw new Error(result.message || "날짜별 기록을 삭제하지 못했습니다.");
        setSavedDates((current) => { const next = new Set(current); next.delete(metricDate); return next; });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "날짜별 기록을 삭제하지 못했습니다.");
        return;
      } finally {
        setSaving(false);
      }
    }
    setMetrics((current) => current.filter((metric) => metric.metricDate !== metricDate));
    setNotice("날짜별 기록을 삭제했습니다.");
  }

  async function save() {
    if (!startDate) return setError("광고 시작일을 선택해 주세요.");
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/ad-performance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, totalBudget, metrics }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "광고성과를 저장하지 못했습니다.");
      setSavedDates(new Set(metrics.map((metric) => metric.metricDate)));
      setNotice("광고 설정과 날짜별 성과를 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "광고성과를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="min-h-screen">
    <div className="mx-auto max-w-[1800px] px-5 py-8 lg:px-8">
      <Button variant="ghost" size="sm" asChild className="mb-5"><Link href="/work"><ArrowLeft />서비스 목록</Link></Button>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><Badge variant="outline" className="mb-3"><BarChart3 />광고 운영</Badge><h1 className="text-3xl font-semibold tracking-tight">광고성과 대시보드</h1><p className="mt-2 max-w-3xl text-muted-foreground">Google·Meta 광고의 노출, 클릭, 접수 DB, 집행비와 랜딩·어드민 DB를 날짜별로 기록합니다.</p></div>
        <Button onClick={() => void save()} disabled={saving || Boolean(initialData.loadError)}>{saving ? <Loader2 className="animate-spin" /> : <Save />}변경사항 저장</Button>
      </div>

      {error ? <Alert variant="destructive" className="mt-6"><AlertTriangle /><AlertTitle>확인이 필요합니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert className="mt-6"><CheckCircle2 /><AlertTitle>처리 완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>광고 시작일</CardTitle><CardDescription>날짜별 성과 기록을 시작하는 기준일</CardDescription></CardHeader><CardContent><Label className="sr-only" htmlFor="ad-start-date">광고 시작일</Label><Input id="ad-start-date" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); if (!metrics.length) setNewMetricDate(event.target.value); setNotice(""); }} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><WalletCards className="size-5" />총예산</CardTitle><CardDescription>캠페인 전체 광고 집행 한도</CardDescription></CardHeader><CardContent><CountInput value={totalBudget} label="총예산" money onChange={(value) => { setTotalBudget(value); setNotice(""); }} /></CardContent></Card>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="누적 광고비" value={won.format(summary.spend)} detail={`예산 ${totalBudget ? `${(summary.spend / totalBudget * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%` : "미설정"} 사용`} />
        <SummaryCard label="남은 예산" value={won.format(summary.remainingBudget)} detail={`총예산 ${won.format(totalBudget)}`} negative={summary.remainingBudget < 0} />
        <SummaryCard label="노출 · 클릭" value={`${number.format(summary.impressions)} · ${number.format(summary.clicks)}`} detail={`클릭률 ${rate(summary.clickThroughRate)}`} />
        <SummaryCard label="광고접수 DB" value={number.format(summary.adLeads)} detail={`DB당 단가 ${cost(summary.adLeadCost)}`} />
        <SummaryCard label="랜딩페이지 DB" value={number.format(summary.landingLeads)} detail={`클릭→랜딩 전환율 ${rate(summary.landingConversionRate)}`} />
        <SummaryCard label="랜딩 DB 단가" value={cost(summary.landingLeadCost)} detail="누적 광고비 ÷ 랜딩페이지 DB" />
        <SummaryCard label="어드민 DB" value={number.format(summary.adminLeads)} detail="Google·Meta 어드민 합계" />
        <SummaryCard label="기록 일수" value={`${number.format(metrics.length)}일`} detail={startDate ? `${startDate} 시작` : "시작일 미설정"} />
      </section>

      <Card className="mt-6">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><CardTitle>날짜별 광고 원시 데이터</CardTitle><CardDescription className="mt-1">입력값은 0 이상의 정수로 저장됩니다. 비율과 단가는 상단에서 자동 계산됩니다.</CardDescription></div>
          <div className="flex flex-wrap items-end gap-2"><div className="space-y-1"><Label htmlFor="new-ad-date">기록 날짜</Label><Input id="new-ad-date" type="date" min={startDate || undefined} value={newMetricDate} onChange={(event) => setNewMetricDate(event.target.value)} /></div><Button type="button" variant="outline" onClick={addMetric}><Plus />날짜 추가</Button></div>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 sm:px-6">
          <Table className="min-w-[1560px]">
            <TableHeader>
              <TableRow><TableHead rowSpan={2} className="sticky left-0 z-20 min-w-32 bg-background px-4">날짜</TableHead><TableHead colSpan={2} className="border-l text-center">광고 노출</TableHead><TableHead colSpan={2} className="border-l text-center">광고 클릭</TableHead><TableHead colSpan={2} className="border-l text-center">광고접수 DB</TableHead><TableHead colSpan={2} className="border-l text-center">광고 집행비용</TableHead><TableHead rowSpan={2} className="border-l text-center">랜딩페이지 DB</TableHead><TableHead colSpan={2} className="border-l text-center">어드민 DB</TableHead><TableHead rowSpan={2} className="w-16" /></TableRow>
              <TableRow><TableHead className="border-l text-center">Google</TableHead><TableHead className="text-center">Meta</TableHead><TableHead className="border-l text-center">Google</TableHead><TableHead className="text-center">Meta</TableHead><TableHead className="border-l text-center">Google</TableHead><TableHead className="text-center">Meta</TableHead><TableHead className="border-l text-center">Google</TableHead><TableHead className="text-center">Meta</TableHead><TableHead className="border-l text-center">Google</TableHead><TableHead className="text-center">Meta</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((metric) => <TableRow key={metric.metricDate}>
                <TableCell className="sticky left-0 z-10 bg-background px-4 font-medium tabular-nums">{metric.metricDate}</TableCell>
                <TableCell className="border-l"><CountInput label={`${metric.metricDate} Google 광고 노출`} value={metric.googleImpressions} onChange={(value) => updateMetric(metric.metricDate, "googleImpressions", value)} /></TableCell>
                <TableCell><CountInput label={`${metric.metricDate} Meta 광고 노출`} value={metric.metaImpressions} onChange={(value) => updateMetric(metric.metricDate, "metaImpressions", value)} /></TableCell>
                <TableCell className="border-l"><CountInput label={`${metric.metricDate} Google 광고 클릭`} value={metric.googleClicks} onChange={(value) => updateMetric(metric.metricDate, "googleClicks", value)} /></TableCell>
                <TableCell><CountInput label={`${metric.metricDate} Meta 광고 클릭`} value={metric.metaClicks} onChange={(value) => updateMetric(metric.metricDate, "metaClicks", value)} /></TableCell>
                <TableCell className="border-l"><CountInput label={`${metric.metricDate} Google 광고접수 DB`} value={metric.googleAdLeads} onChange={(value) => updateMetric(metric.metricDate, "googleAdLeads", value)} /></TableCell>
                <TableCell><CountInput label={`${metric.metricDate} Meta 광고접수 DB`} value={metric.metaAdLeads} onChange={(value) => updateMetric(metric.metricDate, "metaAdLeads", value)} /></TableCell>
                <TableCell className="border-l"><CountInput money label={`${metric.metricDate} Google 광고 집행비용`} value={metric.googleSpend} onChange={(value) => updateMetric(metric.metricDate, "googleSpend", value)} /></TableCell>
                <TableCell><CountInput money label={`${metric.metricDate} Meta 광고 집행비용`} value={metric.metaSpend} onChange={(value) => updateMetric(metric.metricDate, "metaSpend", value)} /></TableCell>
                <TableCell className="border-l"><CountInput label={`${metric.metricDate} 랜딩페이지 접수 DB`} value={metric.landingLeads} onChange={(value) => updateMetric(metric.metricDate, "landingLeads", value)} /></TableCell>
                <TableCell className="border-l"><CountInput label={`${metric.metricDate} Google 어드민 DB`} value={metric.googleAdminLeads} onChange={(value) => updateMetric(metric.metricDate, "googleAdminLeads", value)} /></TableCell>
                <TableCell><CountInput label={`${metric.metricDate} Meta 어드민 DB`} value={metric.metaAdminLeads} onChange={(value) => updateMetric(metric.metricDate, "metaAdminLeads", value)} /></TableCell>
                <TableCell><Button type="button" size="icon" variant="ghost" aria-label={`${metric.metricDate} 삭제`} disabled={saving} onClick={() => void removeMetric(metric.metricDate)}><Trash2 className="text-destructive" /></Button></TableCell>
              </TableRow>)}
              {!metrics.length ? <TableRow><TableCell colSpan={13} className="h-28 text-center text-muted-foreground">기록 날짜를 추가해 광고성과 입력을 시작하세요.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="mt-6 flex justify-end"><Button size="lg" onClick={() => void save()} disabled={saving || Boolean(initialData.loadError)}>{saving ? <Loader2 className="animate-spin" /> : <Save />}변경사항 저장</Button></div>
    </div>
  </main>;
}
