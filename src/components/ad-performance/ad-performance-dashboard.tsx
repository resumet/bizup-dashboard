"use client";

import { isSelectableCourse } from "@/lib/course-operations/course-status";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  Settings2,
} from "lucide-react";

import { AdPerformanceSheetWorkspace } from "@/components/ad-performance/ad-performance-sheet-workspace";
import { AdPerformanceSummaryCards } from "@/components/ad-performance/ad-performance-summary-cards";
import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdPerformanceDashboardData } from "@/lib/ad-performance/types";

const number = new Intl.NumberFormat("ko-KR");

function parseCount(value: string) {
  const parsed = Number(value.replace(/\D/gu, ""));
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export function AdPerformanceDashboard({
  initialData,
}: {
  initialData: AdPerformanceDashboardData;
}) {
  const [courseId, setCourseId] = useState(initialData.course?.id ?? "");
  const [startDate, setStartDate] = useState(initialData.startDate);
  const [totalBudget, setTotalBudget] = useState(initialData.totalBudget);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftCourseId, setDraftCourseId] = useState(
    initialData.course?.id ?? "",
  );
  const [draftStartDate, setDraftStartDate] = useState(initialData.startDate);
  const [draftTotalBudget, setDraftTotalBudget] = useState(
    initialData.totalBudget,
  );
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [notice, setNotice] = useState("");
  const [sheetToolbarContainer, setSheetToolbarContainer] =
    useState<HTMLDivElement | null>(null);
  const pageError = initialData.loadError ?? "";
  const course = initialData.courses.find((item) => item.id === courseId) ?? null;
  const draftCourse = initialData.courses.find((item) => item.id === draftCourseId);

  async function saveSettings() {
    if (!draftCourseId) {
      setSettingsError("강의를 선택해 주세요.");
      return;
    }
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
          courseId: draftCourseId,
          startDate: draftStartDate,
          totalBudget: draftTotalBudget,
          metrics: initialData.metrics,
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(result.message || "광고 설정을 저장하지 못했습니다.");
      }
      setCourseId(draftCourseId);
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
    setDraftCourseId(courseId);
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
              {course?.name ?? "강의 미설정"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div
              ref={setSheetToolbarContainer}
              className="flex flex-wrap items-center gap-2"
            />
            <Button variant="outline" onClick={openSettings}>
              <Settings2 />
              사전설정
            </Button>
          </div>
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

        <AdPerformanceSummaryCards metrics={initialData.metrics} totalBudget={totalBudget} />

        <AdPerformanceSheetWorkspace
          dashboardId={initialData.id}
          dashboardStartDate={startDate}
          sheetState={initialData.sheetState}
          toolbarContainer={sheetToolbarContainer}
        />
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>광고 사전설정</DialogTitle>
            <DialogDescription>
              강의, 광고 시작일과 총예산을 설정합니다.
            </DialogDescription>
          </DialogHeader>

          {settingsError ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>저장할 수 없습니다</AlertTitle>
              <AlertDescription>{settingsError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>강의</Label>
              <Select value={draftCourseId} onValueChange={setDraftCourseId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={initialData.courses.some(isSelectableCourse) ? "강의를 선택하세요" : "선택할 강의가 없습니다"}>
                    {draftCourse ? `${draftCourse.name} · ${draftCourse.instructorName || "강사 미지정"}` : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {initialData.courses.filter(isSelectableCourse).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.instructorName || "강사 미지정"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              disabled={saving || !initialData.courses.length || Boolean(initialData.loadError)}
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
