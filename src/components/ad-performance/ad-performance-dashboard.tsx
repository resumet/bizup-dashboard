"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  Settings2,
} from "lucide-react";

import { AdPerformanceSheetWorkspace } from "@/components/ad-performance/ad-performance-sheet-workspace";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { summarizeAdPerformance } from "@/lib/ad-performance/calculation";
import type { AdPerformanceDashboardData } from "@/lib/ad-performance/types";

const number = new Intl.NumberFormat("ko-KR");

function formatWon(value: number | null) {
  return value === null ? "-" : `${number.format(Math.round(value))}원`;
}

function parseCount(value: string) {
  const parsed = Number(value.replace(/\D/gu, ""));
  return Number.isSafeInteger(parsed) ? parsed : 0;
}
function SummaryCard({
  label,
  value,
  detail,
  negative = false,
}: {
  label: string;
  value: string;
  detail: string;
  negative?: boolean;
}) {
  return (
    <Card size="sm" className={negative ? "ring-destructive/40" : undefined}>
      <CardHeader className="gap-0.5">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <p
          className={`text-xl font-semibold tabular-nums ${negative ? "text-destructive" : ""}`}
        >
          {value}
        </p>
        <CardDescription className="text-[11px] leading-snug">
          {detail}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
function SpendSummaryCard({
  spend,
  budget,
  googleSpend,
  metaSpend,
}: {
  spend: number;
  budget: number;
  googleSpend: number;
  metaSpend: number;
}) {
  const budgetRate = budget
    ? `${((spend / budget) * 100).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`
    : "미설정";
  return (
    <Card size="sm">
      <CardHeader className="gap-0.5">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          전체 집행비용 누적
        </CardTitle>
        <p className="break-all text-xl font-semibold tabular-nums">
          {formatWon(spend)}
        </p>
        <CardDescription className="text-[11px]">
          예산 사용률 {budgetRate}
        </CardDescription>
        <dl className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
          <div className="min-w-0 border-r pr-2">
            <dt className="text-muted-foreground">Google</dt>
            <dd className="truncate font-medium tabular-nums">
              {formatWon(googleSpend)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Meta</dt>
            <dd className="truncate font-medium tabular-nums">
              {formatWon(metaSpend)}
            </dd>
          </div>
        </dl>
      </CardHeader>
    </Card>
  );
}
function DatabaseSummaryCard({
  paidLandingLeads,
  organicLandingLeads,
  totalDatabaseLeads,
  adminCumulativeLeads,
}: {
  paidLandingLeads: number;
  organicLandingLeads: number;
  totalDatabaseLeads: number;
  adminCumulativeLeads: number;
}) {
  const items = [
    { label: "총합 랜딩접수 DB", value: paidLandingLeads },
    { label: "오가닉DB 총합", value: organicLandingLeads },
    { label: "전체DB 총합계", value: totalDatabaseLeads },
    { label: "비즈업에 등록된 DB", value: adminCumulativeLeads },
  ];
  return (
    <Card size="sm" className="sm:col-span-2 lg:col-span-2">
      <CardHeader className="gap-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          DB 유입 합계
        </CardTitle>
        <dl className="grid grid-cols-2 gap-y-3 sm:grid-cols-4 sm:divide-x">
          {items.map((item) => (
            <div
              key={item.label}
              className="min-w-0 px-2 first:pl-0 last:pr-0"
            >
              <dt className="min-h-7 text-[11px] leading-tight text-muted-foreground">
                {item.label}
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {number.format(item.value)}
                <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">
                  건
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </CardHeader>
    </Card>
  );
}

export function AdPerformanceDashboard({
  initialData,
}: {
  initialData: AdPerformanceDashboardData;
}) {
  const [startDate, setStartDate] = useState(initialData.startDate);
  const [totalBudget, setTotalBudget] = useState(initialData.totalBudget);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftStartDate, setDraftStartDate] = useState(initialData.startDate);
  const [draftTotalBudget, setDraftTotalBudget] = useState(
    initialData.totalBudget,
  );
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [notice, setNotice] = useState("");
  const pageError = initialData.loadError ?? "";
  const summary = useMemo(
    () => summarizeAdPerformance(initialData.metrics, totalBudget),
    [initialData.metrics, totalBudget],
  );

  async function saveSettings() {
    if (!draftStartDate) {
      setSettingsError("광고 시작일을 선택해 주세요.");
      return;
    }
    setSaving(true);
    setSettingsError("");
    setNotice("");
    try {
      const response = await fetch(`/api/ad-performance/${initialData.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: draftStartDate,
          totalBudget: draftTotalBudget,
          metrics: initialData.metrics,
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(result.message || "광고 설정을 저장하지 못했습니다.");
      }
      setStartDate(draftStartDate);
      setTotalBudget(draftTotalBudget);
      setNotice("광고 설정을 저장했습니다.");
      setSettingsOpen(false);
    } catch (caught) {
      setSettingsError(
        caught instanceof Error ? caught.message : "광고 설정을 저장하지 못했습니다.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openSettings() {
    setDraftStartDate(startDate);
    setDraftTotalBudget(totalBudget);
    setSettingsError("");
    setSettingsOpen(true);
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" asChild>
              <BackLink href="/services/ad-performance/daily">
                <ArrowLeft />돌아가기
              </BackLink>
            </Button>
            <h1 className="text-3xl font-semibold tracking-tight">
              {initialData.course.name}
            </h1>
          </div>
          <Button variant="outline" onClick={openSettings}>
            <Settings2 />
            사전설정
          </Button>
        </div>

        {pageError ? (
          <Alert variant="destructive" className="mt-6">
            <AlertTriangle />
            <AlertTitle>확인이 필요합니다</AlertTitle>
            <AlertDescription>{pageError}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <Alert className="mt-6">
            <CheckCircle2 />
            <AlertTitle>저장 완료</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}

        <section
          aria-label="성과 요약"
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
        >
          <SpendSummaryCard
            spend={summary.spend}
            budget={totalBudget}
            googleSpend={summary.googleSpend}
            metaSpend={summary.metaSpend}
          />
          <SummaryCard
            label="잔여 예산"
            value={formatWon(summary.remainingBudget)}
            detail={`총예산 ${formatWon(totalBudget)}`}
            negative={summary.remainingBudget < 0}
          />
          <DatabaseSummaryCard
            paidLandingLeads={summary.paidLandingLeads}
            organicLandingLeads={summary.organicLandingLeads}
            totalDatabaseLeads={summary.totalDatabaseLeads}
            adminCumulativeLeads={summary.adminCumulativeLeads}
          />
          <SummaryCard
            label="톡방입장인원"
            value={`${number.format(summary.chatRoomEntrants)}건`}
            detail="기간 내 누적 순입장"
          />
          <SummaryCard
            label="랜딩접수DB단가"
            value={formatWon(summary.paidLandingLeadCost)}
            detail="총광고비 ÷ 랜딩접수DB"
          />
          <SummaryCard
            label="톡방접수DB단가"
            value={formatWon(summary.chatRoomEntrantCost)}
            detail="총광고비 ÷ 톡방입장인원"
          />
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">강의별 광고성과</h2>
          <AdPerformanceSheetWorkspace
            dashboardId={initialData.id}
            dashboardStartDate={startDate}
            sheetState={initialData.sheetState}
          />
        </section>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>광고 사전설정</DialogTitle>
            <DialogDescription>
              광고 시작일과 총예산을 설정합니다.
            </DialogDescription>
          </DialogHeader>

          {settingsError ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>저장할 수 없습니다</AlertTitle>
              <AlertDescription>{settingsError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ad-start-date">광고 시작일</Label>
              <Input
                id="ad-start-date"
                type="date"
                value={draftStartDate}
                onChange={(event) => setDraftStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ad-total-budget">총예산</Label>
              <Input
                id="ad-total-budget"
                inputMode="numeric"
                className="text-right tabular-nums"
                value={
                  draftTotalBudget ? number.format(draftTotalBudget) : ""
                }
                placeholder="0"
                onChange={(event) =>
                  setDraftTotalBudget(parseCount(event.target.value))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={saving}>
                취소
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => void saveSettings()}
              disabled={saving || Boolean(initialData.loadError)}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
