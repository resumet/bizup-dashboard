"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardCopy, ExternalLink, Loader2, Save, Settings2, Share2 } from "lucide-react";

import { AdPerformanceSheetWorkspace } from "@/components/ad-performance/ad-performance-sheet-workspace";
import { AdPerformanceSummaryCards } from "@/components/ad-performance/ad-performance-summary-cards";
import { BackLink } from "@/components/layout/back-link";
import { ExternalMarketingProjectFields } from "./project-fields";
import { ExternalMarketingLinkDialog } from "./link-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdPerformanceDashboardData } from "@/lib/ad-performance/types";
import type { ExternalMarketingInfo, ExternalMarketingProject } from "@/lib/external-marketing/model";

const number = new Intl.NumberFormat("ko-KR");
function parseCount(value: string) {
  const parsed = Number(value.replace(/\D/gu, ""));
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

export function ExternalMarketingDashboard({ project: initialProject, dashboard }: {
  project: ExternalMarketingProject;
  dashboard: AdPerformanceDashboardData;
}) {
  const [project, setProject] = useState(initialProject);
  const [startDate, setStartDate] = useState(dashboard.startDate);
  const [totalBudget, setTotalBudget] = useState(dashboard.totalBudget);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ kind: "intake" | "public"; url: string } | null>(null);
  const [draftInfo, setDraftInfo] = useState<ExternalMarketingInfo>(initialProject);
  const [draftStartDate, setDraftStartDate] = useState(dashboard.startDate);
  const [draftTotalBudget, setDraftTotalBudget] = useState(dashboard.totalBudget);
  const [draftIntakeEnabled, setDraftIntakeEnabled] = useState(initialProject.intakeEnabled);
  const [draftPublicEnabled, setDraftPublicEnabled] = useState(initialProject.publicEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sheetToolbarContainer, setSheetToolbarContainer] = useState<HTMLDivElement | null>(null);

  const intakePath = `/public/external-marketing/intake/${project.intakeToken}`;
  const publicPath = `/public/external-marketing/report/${project.publicToken}`;

  async function persist(input: {
    info: ExternalMarketingInfo;
    nextStartDate: string;
    nextTotalBudget: number;
    intakeEnabled: boolean;
    publicEnabled: boolean;
  }) {
    const response = await fetch(`/api/external-marketing/${project.dashboardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input.info,
        startDate: input.nextStartDate,
        totalBudget: input.nextTotalBudget,
        intakeEnabled: input.intakeEnabled,
        publicEnabled: input.publicEnabled,
      }),
    });
    const result = await response.json() as { message?: string };
    if (!response.ok) throw new Error(result.message || "설정을 저장하지 못했습니다.");
    setProject((current) => ({ ...current, ...input.info, intakeEnabled: input.intakeEnabled, publicEnabled: input.publicEnabled }));
    setStartDate(input.nextStartDate);
    setTotalBudget(input.nextTotalBudget);
  }

  function openSettings() {
    setDraftInfo(project);
    setDraftStartDate(startDate);
    setDraftTotalBudget(totalBudget);
    setDraftIntakeEnabled(project.intakeEnabled);
    setDraftPublicEnabled(project.publicEnabled);
    setError("");
    setSettingsOpen(true);
  }

  async function saveSettings() {
    setSaving(true);
    setError("");
    try {
      await persist({ info: draftInfo, nextStartDate: draftStartDate, nextTotalBudget: draftTotalBudget, intakeEnabled: draftIntakeEnabled, publicEnabled: draftPublicEnabled });
      setNotice("사전설정을 저장했습니다.");
      setSettingsOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function openLinkDialog(kind: "intake" | "public") {
    setLinkDialog({ kind, url: new URL(kind === "intake" ? intakePath : publicPath, window.location.origin).toString() });
  }

  async function changeLinkEnabled(kind: "intake" | "public", enabled: boolean) {
    const response = await fetch(`/api/external-marketing/${project.dashboardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, enabled }),
    });
    const result = await response.json() as { intakeEnabled: boolean; publicEnabled: boolean; message?: string };
    if (!response.ok) throw new Error(result.message || "공개 설정을 저장하지 못했습니다.");
    setProject((current) => ({ ...current, intakeEnabled: result.intakeEnabled, publicEnabled: result.publicEnabled }));
  }

  return <main className="min-h-screen"><div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
    <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
      <div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon-sm" asChild><BackLink href="/services/external-marketing"><ArrowLeft />돌아가기</BackLink></Button><h1 className="truncate text-3xl font-semibold tracking-tight">{project.courseName || "외부 입력 대기"}</h1></div>
      <div className="flex flex-wrap items-center justify-end gap-2"><div ref={setSheetToolbarContainer} className="flex flex-wrap items-center gap-2" /><Button variant="outline" disabled={saving} onClick={() => openLinkDialog("intake")}><ClipboardCopy />외부 입력 주소</Button><Button variant="outline" disabled={saving} onClick={() => openLinkDialog("public")}><Share2 />외부 공개</Button><Button variant="outline" onClick={openSettings}><Settings2 />사전설정</Button></div>
    </div>
    {error ? <Alert variant="destructive" className="mt-6"><AlertTitle>처리하지 못했습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    {notice ? <Alert className="mt-6"><CheckCircle2 /><AlertTitle>완료</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert> : null}

    <Card className="mt-6"><CardContent className="grid gap-4 pt-6 sm:grid-cols-3 xl:grid-cols-5">
      <div><p className="text-xs text-muted-foreground">강사명</p><p className="mt-1 font-medium">{project.instructorName || "미입력"}</p></div><div><p className="text-xs text-muted-foreground">기수</p><p className="mt-1 font-medium">{project.cohort || "미입력"}</p></div><div><p className="text-xs text-muted-foreground">광고 시작일</p><p className="mt-1 font-medium tabular-nums">{startDate}</p></div><div className="sm:col-span-2"><p className="text-xs text-muted-foreground">광고소재 드라이브</p>{project.creativeDriveUrl ? <Link href={project.creativeDriveUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-medium text-primary hover:underline">드라이브 열기 <ExternalLink className="size-3.5 shrink-0" /></Link> : <p className="mt-1 font-medium">미입력</p>}</div>
      <div className="sm:col-span-3 xl:col-span-5"><p className="text-xs text-muted-foreground">채널별 랜딩페이지</p><div className="mt-2 flex flex-wrap gap-2">{project.landingPages.length ? project.landingPages.map((page, index) => <Button key={`${page.channel}-${index}`} size="sm" variant="outline" asChild><Link href={page.url} target="_blank" rel="noopener noreferrer">{page.channel}<ExternalLink /></Link></Button>) : <span className="text-sm">미입력</span>}</div></div>
    </CardContent></Card>

    <AdPerformanceSummaryCards metrics={dashboard.metrics} totalBudget={totalBudget} organicChannels={dashboard.organicChannels} />
    <AdPerformanceSheetWorkspace dashboardId={dashboard.id} dashboardStartDate={startDate} sheetState={dashboard.sheetState} toolbarContainer={sheetToolbarContainer} allowTrackingImport={false} />
  </div>

  {linkDialog ? <ExternalMarketingLinkDialog title={linkDialog.kind === "intake" ? "외부 입력 주소" : "외부 공개"} url={linkDialog.url} enabled={linkDialog.kind === "intake" ? project.intakeEnabled : project.publicEnabled} onClose={() => setLinkDialog(null)} onEnabledChange={(enabled) => changeLinkEnabled(linkDialog.kind, enabled)} /> : null}

  <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>외부마케팅대행 사전설정</DialogTitle></DialogHeader>
    <ExternalMarketingProjectFields value={draftInfo} onChange={setDraftInfo} disabled={saving} />
    <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="external-start-date">광고 시작일</Label><Input id="external-start-date" type="date" value={draftStartDate} disabled={saving} onChange={(event) => setDraftStartDate(event.target.value)} /></div><div className="grid gap-2"><Label htmlFor="external-budget">총예산</Label><Input id="external-budget" inputMode="numeric" className="text-right tabular-nums" value={draftTotalBudget ? number.format(draftTotalBudget) : ""} disabled={saving} onChange={(event) => setDraftTotalBudget(parseCount(event.target.value))} /></div></div>
    <div className="grid gap-3 rounded-lg border p-4"><label className="flex items-center gap-3 text-sm font-medium"><Checkbox checked={draftIntakeEnabled} onCheckedChange={(checked) => setDraftIntakeEnabled(checked === true)} />외부 입력 주소 활성화</label><label className="flex items-center gap-3 text-sm font-medium"><Checkbox checked={draftPublicEnabled} onCheckedChange={(checked) => setDraftPublicEnabled(checked === true)} />광고성과 외부 공개</label></div>
    {error ? <Alert variant="destructive"><AlertTitle>저장할 수 없습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={saving}>취소</Button></DialogClose><Button type="button" disabled={saving || !draftStartDate} onClick={() => void saveSettings()}>{saving ? <Loader2 className="animate-spin" /> : <Save />}저장</Button></DialogFooter>
  </DialogContent></Dialog>
  </main>;
}
