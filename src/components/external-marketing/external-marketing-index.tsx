"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ChevronDown, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";

import { BackLink } from "@/components/layout/back-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ExternalMarketingProjectSummary } from "@/lib/external-marketing/model";
import { externalMarketingWbs, formatWbsCountdown, sortExternalMarketingProjects } from "@/lib/external-marketing/wbs";
import { useSeoulDate } from "./use-seoul-date";

const number = new Intl.NumberFormat("ko-KR");
const won = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 });

export function ExternalMarketingIndex({ projects: initialProjects, today: initialToday }: { projects: ExternalMarketingProjectSummary[]; today: string }) {
  const router = useRouter();
  const today = useSeoulDate(initialToday);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState(initialProjects);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const sorted = sortExternalMarketingProjects(projects, today);
  const search = query.trim().normalize("NFKC").toLocaleLowerCase();
  const visible = sorted.filter((project) => `${project.instructorName} ${project.courseName}`.normalize("NFKC").toLocaleLowerCase().includes(search));
  const recent = [...projects].filter((project) => project.instructorName.trim())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

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
    <div className="mt-6 space-y-3">
      <label className="block max-w-md text-sm font-medium">강사명·강의명 검색<Input className="mt-2" placeholder="강사명 또는 강의명" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {recent.length ? <div className="flex flex-wrap gap-2" aria-label="최근 등록 강의의 강사">{recent.map((project) => <DropdownMenu key={project.dashboardId}>
        <DropdownMenuTrigger asChild><Button variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20" title={`${project.courseName} ${project.cohort}`} aria-label={`${project.instructorName} ${project.courseName} 바로가기`}>{project.instructorName}<ChevronDown /></Button></DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-60"><DropdownMenuLabel>{[project.courseName || "외부 입력 대기", project.cohort].filter(Boolean).join(" · ")}</DropdownMenuLabel>
          <DropdownMenuItem asChild><Link href={`/services/external-marketing/${project.dashboardId}?tab=wbs`}>WBS 바로가기</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href={`/services/external-marketing/${project.dashboardId}?tab=performance`}>광고성과 바로가기</Link></DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>)}</div> : null}
    </div>
    <section className="mt-6 rounded-lg border">
      <Table aria-label="외부마케팅대행 강의 목록"><TableHeader><TableRow>
        {["제목", "기수", "강사명", "광고집행비", "랜딩접수DB수", "접수DB당단가", "광고개시일", "소재전달일", "소재전달일까지 남은 날짜"].map((heading) => <TableHead key={heading}>{heading}</TableHead>)}
      </TableRow></TableHeader><TableBody>{visible.map((project) => {
        const title = project.courseName || "외부 입력 대기";
        const [advertising, creative] = externalMarketingWbs(project.webinarDate, today);
        const dbCount = project.paidLandingLeads + project.organicLandingLeads;
        return <TableRow key={project.dashboardId}>
          <TableCell className="min-w-60"><div className="flex items-center gap-2"><div><Link href={`/services/external-marketing/${project.dashboardId}`} className="font-medium text-primary hover:underline">{title}</Link><p className="mt-1 text-xs text-muted-foreground">웨비나 {project.webinarDate || "날짜 미입력"}</p></div>
            <DropdownMenu><DropdownMenuTrigger asChild><Button className="ml-auto" size="icon-sm" variant="ghost" disabled={deletingId === project.dashboardId} aria-label={`${title} 작업`}>{deletingId === project.dashboardId ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}</Button></DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem variant="destructive" onSelect={() => void deleteProject(project)}><Trash2 />삭제</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </div></TableCell>
          <TableCell>{project.cohort || "미입력"}</TableCell><TableCell>{project.instructorName || "미입력"}</TableCell>
          <TableCell className="tabular-nums">{won.format(project.spend)}</TableCell><TableCell className="tabular-nums">{number.format(dbCount)}건</TableCell>
          <TableCell className="tabular-nums">{dbCount > 0 ? won.format(project.spend / dbCount) : "—"}</TableCell>
          <TableCell className="tabular-nums">{advertising.dueDate || "미입력"}</TableCell><TableCell className="tabular-nums">{creative.dueDate || "미입력"}</TableCell>
          <TableCell className={`tabular-nums ${creative.daysLeft !== null && creative.daysLeft < 0 ? "text-destructive" : ""}`}>{formatWbsCountdown(creative.daysLeft)}</TableCell>
        </TableRow>;
      })}</TableBody></Table>
      {!visible.length ? <p className="p-8 text-center text-sm text-muted-foreground">{projects.length ? "검색 결과가 없습니다." : "아직 외부마케팅대행 대시보드가 없습니다. 대시보드 만들기를 눌러 시작하세요."}</p> : null}
    </section>
  </div></main>;
}
