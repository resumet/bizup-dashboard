"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ExternalMarketingProjectSummary } from "@/lib/external-marketing/model";

const number = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });

export function ExternalMarketingIndex({ projects: initialProjects }: { projects: ExternalMarketingProjectSummary[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  async function createProject() {
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/external-marketing", { method: "POST" });
      const result = await response.json() as { id?: string; message?: string };
      if (!response.ok || !result.id) throw new Error(result.message || "외부마케팅대행 대시보드를 만들지 못했습니다.");
      router.push(`/services/external-marketing/${result.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "외부마케팅대행 대시보드를 만들지 못했습니다.");
      setCreating(false);
    }
  }

  async function deleteProject(project: ExternalMarketingProjectSummary) {
    if (!window.confirm(`${project.courseName || "미입력 프로젝트"} 대시보드와 모든 성과 기록을 삭제할까요?`)) return;
    setDeletingId(project.dashboardId);
    setError("");
    try {
      const response = await fetch(`/api/external-marketing/${project.dashboardId}`, { method: "DELETE" });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "대시보드를 삭제하지 못했습니다.");
      setProjects((current) => current.filter((item) => item.dashboardId !== project.dashboardId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "대시보드를 삭제하지 못했습니다.");
    } finally {
      setDeletingId("");
    }
  }

  return <main className="min-h-screen"><div className="mx-auto max-w-[1900px] px-5 py-8 lg:px-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-2"><Button variant="ghost" size="icon-sm" asChild><BackLink href="/"><ArrowLeft />뒤로가기</BackLink></Button><h1 className="text-3xl font-semibold tracking-tight">외부마케팅대행</h1></div>
      <Button disabled={creating} onClick={() => void createProject()}>{creating ? <Loader2 className="animate-spin" /> : <Plus />}대시보드 만들기</Button>
    </div>
    {error ? <Alert variant="destructive" className="mt-6"><AlertTitle>처리하지 못했습니다</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
    <section className="mt-8">
      {projects.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => {
        const title = project.courseName || "외부 입력 대기";
        return <Card key={project.dashboardId} className="group overflow-hidden transition hover:border-primary/40 hover:shadow-md">
          <CardHeader className="border-b bg-muted/25"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Badge variant="secondary">{project.instructorName || "강사명 미입력"}{project.cohort ? ` · ${project.cohort}` : ""}</Badge><CardTitle className="mt-3 truncate text-xl"><Link href={`/services/external-marketing/${project.dashboardId}`} className="hover:underline">{title}</Link></CardTitle><CardDescription className="mt-1 flex items-center gap-1.5"><CalendarDays className="size-3.5" />광고 시작 {project.startDate}</CardDescription></div><Button type="button" size="icon" variant="ghost" disabled={deletingId === project.dashboardId} aria-label={`${title} 삭제`} onClick={() => void deleteProject(project)}>{deletingId === project.dashboardId ? <Loader2 className="animate-spin" /> : <Trash2 className="text-destructive" />}</Button></div></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-5 pt-5">
            <div><p className="text-xs text-muted-foreground">총예산</p><p className="mt-1 font-semibold tabular-nums">{won.format(project.totalBudget)}</p></div>
            <div><p className="text-xs text-muted-foreground">누적 집행비</p><p className="mt-1 font-semibold tabular-nums">{won.format(project.spend)}</p></div>
            <div><p className="text-xs text-muted-foreground">기록 일수</p><p className="mt-1 font-semibold tabular-nums">{number.format(project.metricCount)}일</p></div>
            <div><p className="text-xs text-muted-foreground">랜딩접수 DB</p><p className="mt-1 font-semibold tabular-nums">{number.format(project.paidLandingLeads + project.organicLandingLeads)}건</p></div>
            <Link href={`/services/external-marketing/${project.dashboardId}`} className="col-span-2 mt-1 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">대시보드 열기 <ArrowRight className="size-4" /></Link>
          </CardContent>
        </Card>;
      })}</div> : <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary"><BriefcaseBusiness className="size-5" /></span><h2 className="font-semibold">아직 외부마케팅대행 대시보드가 없습니다</h2><p className="mt-2 text-sm text-muted-foreground">대시보드를 만들면 외부 입력 주소와 공개 성과 페이지가 함께 준비됩니다.</p></CardContent></Card>}
    </section>
  </div></main>;
}
