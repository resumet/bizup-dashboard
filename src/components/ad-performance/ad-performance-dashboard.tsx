"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, ChevronDown, Loader2, Plus, Save, Settings2, X } from "lucide-react";

import { AdPerformanceMetricDialog } from "@/components/ad-performance/ad-performance-metric-dialog";
import { AdPerformanceRawTable } from "@/components/ad-performance/ad-performance-raw-table";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { summarizeAdPerformance } from "@/lib/ad-performance/calculation";
import { nextMetricDate } from "@/lib/ad-performance/date";
import type { AdPerformanceDailyMetric, AdPerformanceDashboardData, AdPerformanceOrganicChannel } from "@/lib/ad-performance/types";

const number = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });
type NumericMetricField = Exclude<keyof AdPerformanceDailyMetric, "metricDate" | "organicLeads" | "chatRoomMembers">;
const numericFields: NumericMetricField[] = [
  "googleImpressions", "metaImpressions", "googleClicks", "metaClicks",
  "googleAdLeads", "metaAdLeads", "googleSpend", "metaSpend",
  "googleLandingLeads", "metaLandingLeads", "adminCumulativeLeads",
];

function emptyMetric(metricDate: string, channels: AdPerformanceOrganicChannel[]): AdPerformanceDailyMetric {
  return {
    metricDate,
    chatRoomMembers: null,
    ...Object.fromEntries(numericFields.map((field) => [field, 0])),
    organicLeads: Object.fromEntries(channels.map((channel) => [channel.id, 0])),
  } as AdPerformanceDailyMetric;
}

function parseCount(value: string) {
  const parsed = Number(value.replace(/\D/gu, ""));
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function SummaryCard({ label, value, detail, negative = false }: { label: string; value: string; detail: string; negative?: boolean }) {
  return <Card className={negative ? "border-destructive/40" : undefined}><CardHeader className="gap-1"><CardTitle>{label}</CardTitle><CardDescription className="text-xs">{detail}</CardDescription><p className={`pt-2 text-2xl font-semibold tabular-nums ${negative ? "text-destructive" : ""}`}>{value}</p></CardHeader></Card>;
}

function ConversionCard({ label, google, meta, detail }: { label: string; google: number | null; meta: number | null; detail: string }) {
  return <Card><CardHeader className="gap-1">
    <CardTitle>{label}</CardTitle>
    <CardDescription className="text-xs">{detail}</CardDescription>
    <table aria-label={label} className="mt-2 w-full table-fixed text-center">
      <thead><tr><th scope="col" className="border-r pb-1 text-sm font-medium text-muted-foreground">Google</th><th scope="col" className="pb-1 text-sm font-medium text-muted-foreground">Meta</th></tr></thead>
      <tbody><tr><td className="border-r px-1 text-xl font-semibold tabular-nums">{rate(google)}</td><td className="px-1 text-xl font-semibold tabular-nums">{rate(meta)}</td></tr></tbody>
    </table>
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
  const [dialogMetric, setDialogMetric] = useState<AdPerformanceDailyMetric | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [metricDialogOpen, setMetricDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [channelBusy, setChannelBusy] = useState(false);
  const [error, setError] = useState(initialData.loadError ?? "");
  const [notice, setNotice] = useState("");
  const summary = useMemo(() => summarizeAdPerformance(metrics, totalBudget), [metrics, totalBudget]);

  function openNewMetric() {
    const metricDate = nextMetricDate(metrics.map((metric) => metric.metricDate), startDate);
    setDialogMetric(emptyMetric(metricDate, channels));
    setEditingDate(null);
    setDialogError("");
    setMetricDialogOpen(true);
  }

  function openEditMetric(metricDate: string) {
    const metric = metrics.find((item) => item.metricDate === metricDate);
    if (!metric) return;
    setDialogMetric({ ...metric, organicLeads: { ...metric.organicLeads } });
    setEditingDate(metricDate);
    setDialogError("");
    setMetricDialogOpen(true);
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
        const message = caught instanceof Error ? caught.message : "날짜별 기록을 삭제하지 못했습니다.";
        setError(message);
        setDialogError(message);
        return;
      } finally {
        setSaving(false);
      }
    }
    setMetrics((current) => current.filter((metric) => metric.metricDate !== metricDate));
    setNotice("날짜별 기록을 삭제했습니다.");
    setMetricDialogOpen(false);
    setDialogMetric(null);
    setEditingDate(null);
  }

  async function save(
    nextMetrics = metrics,
    successNotice = "광고 설정과 날짜별 성과를 저장했습니다.",
    renamedMetricDate?: { from: string; to: string },
  ): Promise<string | null> {
    if (!startDate) {
      const message = "광고 시작일을 선택해 주세요.";
      setError(message);
      return message;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/ad-performance/${initialData.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, totalBudget, metrics: nextMetrics, renamedMetricDate }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "광고성과를 저장하지 못했습니다.");
      setMetrics(nextMetrics);
      setSavedDates(new Set(nextMetrics.map((metric) => metric.metricDate)));
      setNotice(successNotice);
      return null;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "광고성과를 저장하지 못했습니다.";
      setError(message);
      return message;
    } finally {
      setSaving(false);
    }
  }

  async function saveMetric() {
    if (!dialogMetric || saving) return;
    const metricDate = dialogMetric.metricDate;
    const timestamp = Date.parse(`${metricDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(metricDate) || Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== metricDate) {
      setDialogError("기록할 날짜를 선택해 주세요.");
      return;
    }
    if (metricDate < startDate) {
      setDialogError("광고 시작일 이전 날짜는 추가할 수 없습니다.");
      return;
    }
    if (metrics.some((metric) => metric.metricDate === metricDate && metric.metricDate !== editingDate)) {
      setDialogError("이미 입력된 날짜입니다.");
      return;
    }
    const nextMetrics = editingDate
      ? metrics.map((metric) => metric.metricDate === editingDate ? dialogMetric : metric)
      : [...metrics, dialogMetric].sort((a, b) => a.metricDate.localeCompare(b.metricDate));
    const renamedMetricDate = editingDate && editingDate !== metricDate
      ? { from: editingDate, to: metricDate }
      : undefined;
    setDialogError("");
    const failed = await save(
      nextMetrics,
      `${metricDate} 광고성과 기록을 저장했습니다.`,
      renamedMetricDate,
    );
    if (failed) setDialogError(failed);
    else {
      setMetricDialogOpen(false);
      setDialogMetric(null);
      setEditingDate(null);
    }
  }

  return <main className="min-h-screen">
    <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
      <Button variant="ghost" size="sm" asChild className="mb-5"><BackLink href="/services/ad-performance/daily"><ArrowLeft />뒤로가기</BackLink></Button>
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><Badge variant="outline" className="mb-3"><BarChart3 />{initialData.course.instructorName || "강사 미지정"}</Badge><h1 className="text-3xl font-semibold tracking-tight">{initialData.course.name}</h1><p className="mt-2 max-w-3xl text-muted-foreground">광고와 오가닉 채널의 날짜별 DB 유입을 기록하고 매체별 전환율을 자동 계산합니다.</p></div>
        <Button onClick={() => void save()} disabled={saving || channelBusy || Boolean(initialData.loadError)}>{saving ? <Loader2 className="animate-spin" /> : <Save />}변경사항 저장</Button>
      </div>
      {error ? <Alert variant="destructive" className="mt-6"><AlertTriangle /><AlertTitle>확인이 필요합니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {notice ? <Alert className="mt-6"><CheckCircle2 /><AlertTitle>처리 완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}

      <details open className="group mt-6 border-y">
        <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2"><Settings2 className="size-4" />사전설정</span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid min-w-0 gap-5 pb-5 md:grid-cols-[180px_160px_minmax(0,1fr)]">
          <div className="min-w-0 space-y-2">
            <Label htmlFor="ad-start-date">광고시작일 설정</Label>
            <Input id="ad-start-date" className="min-w-0" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setNotice(""); }} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="ad-total-budget">총예산 설정</Label>
            <Input id="ad-total-budget" inputMode="numeric" className="text-right tabular-nums" aria-label="총예산" value={totalBudget ? number.format(totalBudget) : ""} placeholder="0" onChange={(event) => { setTotalBudget(parseCount(event.target.value)); setNotice(""); }} />
          </div>
          <div className="min-w-0 space-y-2">
            <Label htmlFor="organic-channel-name">오가닉 채널 설정</Label>
          <div className="flex max-w-xl gap-2"><Input id="organic-channel-name" className="min-w-0" value={newChannelName} maxLength={80} placeholder="예: 네이버 블로그" onChange={(event) => setNewChannelName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addOrganicChannel(); } }} /><Button type="button" variant="outline" disabled={channelBusy || !newChannelName.trim()} onClick={() => void addOrganicChannel()}>{channelBusy ? <Loader2 className="animate-spin" /> : <Plus />}채널 추가</Button></div>
          <div className="mt-2 flex flex-wrap gap-2">{channels.length ? channels.map((channel) => <Badge key={channel.id} variant="secondary" className="gap-1 py-1.5 pl-3 pr-1">{channel.name}<button type="button" className="rounded p-1 hover:bg-background" disabled={channelBusy} aria-label={`${channel.name} 채널 삭제`} onClick={() => void removeOrganicChannel(channel)}><X className="size-3.5" /></button></Badge>) : <p className="text-sm text-muted-foreground">등록된 오가닉 채널이 없습니다.</p>}</div>
          </div>
        </div>
      </details>

      <section aria-label="성과 요약" className="mt-6 grid gap-4 xl:grid-cols-2">
        <div aria-label="광고비 및 전환율" className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Card><CardHeader className="gap-1">
          <CardTitle>누적 광고비</CardTitle>
          <CardDescription className="text-xs">예산 {totalBudget ? `${(summary.spend / totalBudget * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%` : "미설정"} 사용</CardDescription>
          <p className="break-all pt-2 text-2xl font-semibold tabular-nums" aria-label="전체 누적광고비">{won.format(summary.spend)}</p>
          <table aria-label="매체별 누적광고비" className="w-full table-fixed text-center">
            <thead><tr><th scope="col" className="border-r pb-1 text-sm font-medium text-muted-foreground">Google</th><th scope="col" className="pb-1 text-sm font-medium text-muted-foreground">Meta</th></tr></thead>
            <tbody><tr><td className="break-all border-r px-1 font-semibold tabular-nums">{won.format(summary.googleSpend)}</td><td className="break-all px-1 font-semibold tabular-nums">{won.format(summary.metaSpend)}</td></tr></tbody>
          </table>
        </CardHeader></Card>
        <SummaryCard label="남은 예산" value={won.format(summary.remainingBudget)} detail={`총예산 ${won.format(totalBudget)}`} negative={summary.remainingBudget < 0} />
        <ConversionCard label="광고클릭전환율" google={summary.googleClickConversionRate} meta={summary.metaClickConversionRate} detail="광고클릭수 ÷ 광고노출수" />
        <ConversionCard label="랜딩전환율" google={summary.googleLandingConversionRate} meta={summary.metaLandingConversionRate} detail="광고접수 DB ÷ 광고클릭수" />
        </div>
        <div aria-label="DB 요약" className="grid min-w-0 gap-4 sm:grid-cols-2">
        <SummaryCard label="랜딩접수 DB(광고)" value={`${number.format(summary.paidLandingLeads)}건`} detail="Google + Meta 랜딩 DB" />
        <SummaryCard label="랜딩접수 DB(오가닉)" value={`${number.format(summary.organicLandingLeads)}건`} detail="등록된 오가닉 전 채널 합계" />
        <SummaryCard label="DB 총합" value={`${number.format(summary.totalDatabaseLeads)}건`} detail="광고 랜딩 DB + 오가닉 랜딩 DB" />
        <SummaryCard label="어드민 누적 DB" value={`${number.format(summary.adminCumulativeLeads)}건`} detail="가장 최근 날짜에 직접 입력한 누적값" />
        </div>
      </section>


      <Card className="mt-6">
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>날짜별 광고·오가닉 원시 데이터</CardTitle>
            <CardDescription className="mt-1 text-xs">표는 읽기 전용입니다. 새 날짜 입력과 기존 기록 수정은 팝업에서 진행합니다.</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={openNewMetric} disabled={saving || channelBusy || Boolean(initialData.loadError)}>
            <Plus />원시 데이터 입력
          </Button>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <AdPerformanceRawTable metrics={metrics} channels={channels} onEdit={openEditMetric} disabled={saving || channelBusy || Boolean(initialData.loadError)} />
        </CardContent>
      </Card>
      {dialogMetric ? <AdPerformanceMetricDialog
        open={metricDialogOpen}
        onOpenChange={(open) => {
          if (saving) return;
          setMetricDialogOpen(open);
          if (!open) {
            setDialogMetric(null);
            setEditingDate(null);
            setDialogError("");
          }
        }}
        metric={dialogMetric}
        isNew={editingDate === null}
        channels={channels}
        startDate={startDate}
        busy={saving || channelBusy}
        error={dialogError}
        onMetricChange={setDialogMetric}
        onSave={() => void saveMetric()}
        onDelete={editingDate ? () => void removeMetric(editingDate) : undefined}
      /> : null}
      <div className="mt-6 flex justify-end"><Button size="lg" onClick={() => void save()} disabled={saving || channelBusy || Boolean(initialData.loadError)}>{saving ? <Loader2 className="animate-spin" /> : <Save />}변경사항 저장</Button></div>
    </div>
  </main>;
}
