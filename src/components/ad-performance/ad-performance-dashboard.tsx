"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Leaf, Loader2, Plus, Save, Trash2, WalletCards, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { summarizeAdPerformance } from "@/lib/ad-performance/calculation";
import type { AdPerformanceDailyMetric, AdPerformanceDashboardData, AdPerformanceOrganicChannel } from "@/lib/ad-performance/types";

const number = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
type NumericMetricField = Exclude<keyof AdPerformanceDailyMetric, "metricDate" | "organicLeads">;
const numericFields: NumericMetricField[] = [
  "googleImpressions", "metaImpressions", "googleClicks", "metaClicks",
  "googleAdLeads", "metaAdLeads", "googleSpend", "metaSpend",
  "googleLandingLeads", "metaLandingLeads", "adminCumulativeLeads",
];

function todayInSeoul() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function emptyMetric(metricDate: string, channels: AdPerformanceOrganicChannel[]): AdPerformanceDailyMetric {
  return {
    metricDate,
    ...Object.fromEntries(numericFields.map((field) => [field, 0])),
    organicLeads: Object.fromEntries(channels.map((channel) => [channel.id, 0])),
  } as AdPerformanceDailyMetric;
}

function parseCount(value: string) {
  const parsed = Number(value.replace(/\D/gu, ""));
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator * 100 : null;
}

function organicTotal(metric: AdPerformanceDailyMetric) {
  return Object.values(metric.organicLeads).reduce((sum, value) => sum + value, 0);
}

function CountInput({ value, label, onChange, money = false }: { value: number; label: string; onChange: (value: number) => void; money?: boolean }) {
  return <Input className={`h-8 min-w-0 px-1 text-right tabular-nums ${money ? "w-[104px]" : "w-[88px]"}`} inputMode="numeric" aria-label={label} value={value ? number.format(value) : ""} placeholder="0" onChange={(event) => onChange(parseCount(event.target.value))} title={money ? won.format(value) : number.format(value)} />;
}

function SummaryCard({ label, value, detail, negative = false }: { label: string; value: string; detail: string; negative?: boolean }) {
  return <Card className={negative ? "border-destructive/40" : undefined}><CardHeader className="gap-2"><CardDescription>{label}</CardDescription><CardTitle className={`text-2xl tabular-nums ${negative ? "text-destructive" : ""}`}>{value}</CardTitle><p className="text-xs text-muted-foreground">{detail}</p></CardHeader></Card>;
}

function ConversionCard({ label, google, meta, detail }: { label: string; google: number | null; meta: number | null; detail: string }) {
  return <Card><CardHeader className="gap-2">
    <CardDescription>{label}</CardDescription>
    <table aria-label={label} className="w-full table-fixed text-center">
      <thead><tr><th scope="col" className="border-r pb-1 text-sm font-medium text-muted-foreground">Google</th><th scope="col" className="pb-1 text-sm font-medium text-muted-foreground">Meta</th></tr></thead>
      <tbody><tr><td className="border-r px-1 text-xl font-semibold tabular-nums">{rate(google)}</td><td className="px-1 text-xl font-semibold tabular-nums">{rate(meta)}</td></tr></tbody>
    </table>
    <p className="text-xs text-muted-foreground">{detail}</p>
  </CardHeader></Card>;
}

function rate(value: number | null) {
  return value === null ? "-" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
}

export function AdPerformanceDashboard({ initialData }: { initialData: AdPerformanceDashboardData }) {
  const [startDate, setStartDate] = useState(initialData.startDate);
  const [totalBudget, setTotalBudget] = useState(initialData.totalBudget);
  const [channels, setChannels] = useState(initialData.organicChannels);
  const [metrics, setMetrics] = useState(() => [...initialData.metrics].sort((a, b) => a.metricDate.localeCompare(b.metricDate)));
  const [savedDates, setSavedDates] = useState(() => new Set(initialData.metrics.map((metric) => metric.metricDate)));
  const [newMetricDate, setNewMetricDate] = useState(initialData.startDate || todayInSeoul());
  const [newChannelName, setNewChannelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [channelBusy, setChannelBusy] = useState(false);
  const [error, setError] = useState(initialData.loadError ?? "");
  const [notice, setNotice] = useState("");
  const summary = useMemo(() => summarizeAdPerformance(metrics, totalBudget), [metrics, totalBudget]);

  function updateMetric(metricDate: string, field: NumericMetricField, value: number) {
    setMetrics((current) => current.map((metric) => metric.metricDate === metricDate ? { ...metric, [field]: value } : metric));
    setNotice("");
  }

  function updateOrganicMetric(metricDate: string, channelId: string, value: number) {
    setMetrics((current) => current.map((metric) => metric.metricDate === metricDate
      ? { ...metric, organicLeads: { ...metric.organicLeads, [channelId]: value } }
      : metric));
    setNotice("");
  }

  function addMetric() {
    setError("");
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(newMetricDate)) return setError("기록할 날짜를 선택해 주세요.");
    if (startDate && newMetricDate < startDate) return setError("광고 시작일 이전 날짜는 추가할 수 없습니다.");
    if (metrics.some((metric) => metric.metricDate === newMetricDate)) return setError("이미 추가된 날짜입니다.");
    setMetrics((current) => [...current, emptyMetric(newMetricDate, channels)].sort((a, b) => a.metricDate.localeCompare(b.metricDate)));
    setNotice("");
  }

  async function addOrganicChannel() {
    const name = newChannelName.trim();
    if (!name) return setError("오가닉 채널명을 입력해 주세요.");
    setChannelBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/ad-performance/${initialData.id}/organic-channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json() as AdPerformanceOrganicChannel & { message?: string };
      if (!response.ok || !result.id) throw new Error(result.message || "오가닉 채널을 추가하지 못했습니다.");
      setChannels((current) => [...current, result]);
      setMetrics((current) => current.map((metric) => ({ ...metric, organicLeads: { ...metric.organicLeads, [result.id]: 0 } })));
      setNewChannelName("");
      setNotice(`${result.name} 오가닉 채널을 추가했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "오가닉 채널을 추가하지 못했습니다.");
    } finally {
      setChannelBusy(false);
    }
  }

  async function removeOrganicChannel(channel: AdPerformanceOrganicChannel) {
    if (!window.confirm(`${channel.name} 채널과 입력된 DB 유입량을 모두 삭제할까요?`)) return;
    setChannelBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/ad-performance/${initialData.id}/organic-channels/${channel.id}`, { method: "DELETE" });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "오가닉 채널을 삭제하지 못했습니다.");
      setChannels((current) => current.filter((item) => item.id !== channel.id));
      setMetrics((current) => current.map((metric) => {
        const organicLeads = { ...metric.organicLeads };
        delete organicLeads[channel.id];
        return { ...metric, organicLeads };
      }));
      setNotice(`${channel.name} 오가닉 채널을 삭제했습니다.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "오가닉 채널을 삭제하지 못했습니다.");
    } finally {
      setChannelBusy(false);
    }
  }

  async function removeMetric(metricDate: string) {
    if (savedDates.has(metricDate)) {
      if (!window.confirm(`${metricDate} 광고성과 기록을 삭제할까요?`)) return;
      setSaving(true);
      setError("");
      try {
        const response = await fetch(`/api/ad-performance/${initialData.id}/metrics/${metricDate}`, { method: "DELETE" });
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
      const response = await fetch(`/api/ad-performance/${initialData.id}`, {
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

  const organicColumnCount = Math.max(1, channels.length);
  return <main className="min-h-screen">
    <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
      <Button variant="ghost" size="sm" asChild className="mb-5"><Link href="/services/ad-performance"><ArrowLeft />광고성과 목록</Link></Button>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><Badge variant="outline" className="mb-3"><BarChart3 />{initialData.course.instructorName || "강사 미지정"}</Badge><h1 className="text-3xl font-semibold tracking-tight">{initialData.course.name}</h1><p className="mt-2 max-w-3xl text-muted-foreground">광고와 오가닉 채널의 날짜별 DB 유입을 기록하고 매체별 전환율을 자동 계산합니다.</p></div>
        <Button onClick={() => void save()} disabled={saving || channelBusy || Boolean(initialData.loadError)}>{saving ? <Loader2 className="animate-spin" /> : <Save />}변경사항 저장</Button>
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
        <SummaryCard label="랜딩접수 DB(광고)" value={`${number.format(summary.paidLandingLeads)}건`} detail="Google + Meta 랜딩 DB" />
        <SummaryCard label="랜딩접수 DB(오가닉)" value={`${number.format(summary.organicLandingLeads)}건`} detail="등록된 오가닉 전 채널 합계" />
        <SummaryCard label="DB 총합" value={`${number.format(summary.totalDatabaseLeads)}건`} detail="광고 랜딩 DB + 오가닉 랜딩 DB" />
        <SummaryCard label="어드민 누적 DB" value={`${number.format(summary.adminCumulativeLeads)}건`} detail="가장 최근 날짜에 직접 입력한 누적값" />
        <ConversionCard label="광고클릭전환율" google={summary.googleClickConversionRate} meta={summary.metaClickConversionRate} detail="광고클릭수 ÷ 광고노출수" />
        <ConversionCard label="랜딩전환율" google={summary.googleLandingConversionRate} meta={summary.metaLandingConversionRate} detail="광고접수 DB ÷ 광고클릭수" />
      </section>

      <Card className="mt-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><Leaf className="size-5" />오가닉 채널</CardTitle><CardDescription>블로그, 유튜브, 검색 등 광고비 없이 유입되는 채널을 추가하고 날짜별 DB를 입력합니다.</CardDescription></CardHeader>
        <CardContent>
          <div className="flex max-w-xl gap-2"><Input value={newChannelName} maxLength={80} placeholder="예: 네이버 블로그" onChange={(event) => setNewChannelName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addOrganicChannel(); } }} /><Button type="button" variant="outline" disabled={channelBusy || !newChannelName.trim()} onClick={() => void addOrganicChannel()}>{channelBusy ? <Loader2 className="animate-spin" /> : <Plus />}채널 추가</Button></div>
          <div className="mt-4 flex flex-wrap gap-2">{channels.length ? channels.map((channel) => <Badge key={channel.id} variant="secondary" className="gap-1 py-1.5 pl-3 pr-1">{channel.name}<button type="button" className="rounded p-1 hover:bg-background" disabled={channelBusy} aria-label={`${channel.name} 채널 삭제`} onClick={() => void removeOrganicChannel(channel)}><X className="size-3.5" /></button></Badge>) : <p className="text-sm text-muted-foreground">등록된 오가닉 채널이 없습니다.</p>}</div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><CardTitle>날짜별 광고·오가닉 원시 데이터</CardTitle><CardDescription className="mt-1">흰색 입력칸만 직접 입력합니다. 합계와 전환율은 자동 계산됩니다.</CardDescription></div>
          <div className="flex flex-wrap items-end gap-2"><div className="space-y-1"><Label htmlFor="new-ad-date">기록 날짜</Label><Input id="new-ad-date" type="date" min={startDate || undefined} value={newMetricDate} onChange={(event) => setNewMetricDate(event.target.value)} /></div><Button type="button" variant="outline" onClick={addMetric}><Plus />날짜 추가</Button></div>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0 sm:px-6">
          <Table className="w-max [&_td]:px-1 [&_td]:py-1 [&_th]:h-8 [&_th]:px-1 [&_th]:py-1">
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="sticky left-0 z-20 min-w-[88px] bg-background px-1">날짜</TableHead>
                <TableHead colSpan={2} className="border-l text-center">광고 노출</TableHead><TableHead colSpan={2} className="border-l text-center">광고 클릭</TableHead><TableHead colSpan={2} className="border-l text-center">광고접수 DB</TableHead><TableHead colSpan={2} className="border-l text-center">광고 집행비용</TableHead><TableHead colSpan={3} className="border-l text-center">랜딩페이지접수 DB</TableHead>
                <TableHead colSpan={organicColumnCount + 1} className="border-l text-center">오가닉 채널 DB</TableHead>
                <TableHead rowSpan={2} className="border-l bg-muted/40 text-center">DB 총합</TableHead>
                <TableHead colSpan={2} className="border-l bg-muted/40 text-center">클릭전환</TableHead>
                <TableHead colSpan={2} className="border-l bg-muted/40 text-center">랜딩전환</TableHead>
                <TableHead rowSpan={2} className="border-l text-center">어드민<br />누적 DB</TableHead><TableHead rowSpan={2} className="w-9" />
              </TableRow>
              <TableRow>
                {Array.from({ length: 5 }).flatMap((_, index) => [<TableHead key={`${index}-g`} className="border-l text-center">Google</TableHead>, <TableHead key={`${index}-m`} className="text-center">Meta</TableHead>])}
                <TableHead className="border-l bg-muted/40 text-center">총합</TableHead>
                {channels.length ? channels.map((channel, index) => <TableHead key={channel.id} className={`${index === 0 ? "border-l " : ""}w-[80px] max-w-[104px] whitespace-normal break-words text-center`}>{channel.name}</TableHead>) : <TableHead className="border-l text-center text-muted-foreground">채널 없음</TableHead>}
                <TableHead className="border-l bg-muted/40 text-center">총합</TableHead>
                <TableHead className="border-l bg-muted/40 text-center">Google</TableHead><TableHead className="bg-muted/40 text-center">Meta</TableHead><TableHead className="border-l bg-muted/40 text-center">Google</TableHead><TableHead className="bg-muted/40 text-center">Meta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((metric) => {
                const paidLanding = metric.googleLandingLeads + metric.metaLandingLeads;
                const organicLanding = organicTotal(metric);
                return <TableRow key={metric.metricDate}>
                  <TableCell className="sticky left-0 z-10 bg-background px-1 font-medium tabular-nums">{metric.metricDate}</TableCell>
                  <TableCell className="border-l"><CountInput label={`${metric.metricDate} Google 광고 노출`} value={metric.googleImpressions} onChange={(value) => updateMetric(metric.metricDate, "googleImpressions", value)} /></TableCell><TableCell><CountInput label={`${metric.metricDate} Meta 광고 노출`} value={metric.metaImpressions} onChange={(value) => updateMetric(metric.metricDate, "metaImpressions", value)} /></TableCell>
                  <TableCell className="border-l"><CountInput label={`${metric.metricDate} Google 광고 클릭`} value={metric.googleClicks} onChange={(value) => updateMetric(metric.metricDate, "googleClicks", value)} /></TableCell><TableCell><CountInput label={`${metric.metricDate} Meta 광고 클릭`} value={metric.metaClicks} onChange={(value) => updateMetric(metric.metricDate, "metaClicks", value)} /></TableCell>
                  <TableCell className="border-l"><CountInput label={`${metric.metricDate} Google 광고접수 DB`} value={metric.googleAdLeads} onChange={(value) => updateMetric(metric.metricDate, "googleAdLeads", value)} /></TableCell><TableCell><CountInput label={`${metric.metricDate} Meta 광고접수 DB`} value={metric.metaAdLeads} onChange={(value) => updateMetric(metric.metricDate, "metaAdLeads", value)} /></TableCell>
                  <TableCell className="border-l"><CountInput money label={`${metric.metricDate} Google 광고 집행비용`} value={metric.googleSpend} onChange={(value) => updateMetric(metric.metricDate, "googleSpend", value)} /></TableCell><TableCell><CountInput money label={`${metric.metricDate} Meta 광고 집행비용`} value={metric.metaSpend} onChange={(value) => updateMetric(metric.metricDate, "metaSpend", value)} /></TableCell>
                  <TableCell className="border-l"><CountInput label={`${metric.metricDate} Google 랜딩페이지접수 DB`} value={metric.googleLandingLeads} onChange={(value) => updateMetric(metric.metricDate, "googleLandingLeads", value)} /></TableCell><TableCell><CountInput label={`${metric.metricDate} Meta 랜딩페이지접수 DB`} value={metric.metaLandingLeads} onChange={(value) => updateMetric(metric.metricDate, "metaLandingLeads", value)} /></TableCell>
                  <TableCell className="border-l bg-muted/30 text-right font-medium tabular-nums">{number.format(paidLanding)}</TableCell>
                  {channels.length ? channels.map((channel, index) => <TableCell key={channel.id} className={index === 0 ? "border-l" : undefined}><CountInput label={`${metric.metricDate} ${channel.name} DB 유입량`} value={metric.organicLeads[channel.id] ?? 0} onChange={(value) => updateOrganicMetric(metric.metricDate, channel.id, value)} /></TableCell>) : <TableCell className="border-l text-center text-muted-foreground">-</TableCell>}
                  <TableCell className="border-l bg-muted/30 text-right font-medium tabular-nums">{number.format(organicLanding)}</TableCell><TableCell className="border-l bg-muted/30 text-right font-semibold tabular-nums">{number.format(paidLanding + organicLanding)}</TableCell>
                  <TableCell className="border-l bg-muted/30 text-right tabular-nums">{rate(ratio(metric.googleClicks, metric.googleImpressions))}</TableCell><TableCell className="bg-muted/30 text-right tabular-nums">{rate(ratio(metric.metaClicks, metric.metaImpressions))}</TableCell><TableCell className="border-l bg-muted/30 text-right tabular-nums">{rate(ratio(metric.googleAdLeads, metric.googleClicks))}</TableCell><TableCell className="bg-muted/30 text-right tabular-nums">{rate(ratio(metric.metaAdLeads, metric.metaClicks))}</TableCell>
                  <TableCell className="border-l"><CountInput label={`${metric.metricDate} 어드민 누적 DB`} value={metric.adminCumulativeLeads} onChange={(value) => updateMetric(metric.metricDate, "adminCumulativeLeads", value)} /></TableCell>
                  <TableCell><Button type="button" size="icon" variant="ghost" className="size-8" aria-label={`${metric.metricDate} 삭제`} disabled={saving} onClick={() => void removeMetric(metric.metricDate)}><Trash2 className="text-destructive" /></Button></TableCell>
                </TableRow>;
              })}
              {!metrics.length ? <TableRow><TableCell colSpan={20 + organicColumnCount} className="h-28 text-center text-muted-foreground">기록 날짜를 추가해 광고성과 입력을 시작하세요.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="mt-6 flex justify-end"><Button size="lg" onClick={() => void save()} disabled={saving || channelBusy || Boolean(initialData.loadError)}>{saving ? <Loader2 className="animate-spin" /> : <Save />}변경사항 저장</Button></div>
    </div>
  </main>;
}
