import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, FileSpreadsheet, Plus, Users } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DeleteJobButton } from "@/components/jobs/delete-job-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAuthenticatedUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type CourseJob = {
  id: string;
  name: string;
  default_course_name: string | null;
  status: string;
  latest_version: number;
  valid_count: number;
  error_count: number;
  updated_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "작성 중",
  processing: "처리 중",
  ready: "분석 완료",
  failed: "실패",
  archived: "보관됨",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function CourseRosterPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("course_jobs")
    .select("id,name,default_course_name,status,latest_version,valid_count,error_count,updated_at")
    .order("updated_at", { ascending: false });
  const jobs = (data ?? []) as CourseJob[];
  const validCount = jobs.reduce((sum, job) => sum + job.valid_count, 0);
  const errorCount = jobs.reduce((sum, job) => sum + job.error_count, 0);

  return <main className="min-h-screen">
    <header className="border-b bg-background"><div className="mx-auto flex h-18 max-w-[1600px] items-center px-5 lg:px-8"><Button variant="ghost" size="sm" asChild><Link href="/"><ArrowLeft />서비스</Link></Button><div className="mx-3 h-5 w-px bg-border" /><span className="font-semibold">수강생 명단 분석</span></div></header>
    <div className="mx-auto max-w-[1600px] px-5 py-10 lg:px-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><Badge variant="outline" className="mb-3">수강생 데이터</Badge><h1 className="text-3xl font-semibold tracking-tight">작업 목록</h1><p className="mt-2 text-muted-foreground">Supabase에 저장된 신청자 명단과 분석 상태입니다.</p></div><Button asChild><Link href="/services/course-roster/new"><Plus />새 작업</Link></Button></div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric title="전체 작업" value={`${jobs.length}건`} note="현재 워크스페이스" icon={<FileSpreadsheet className="size-4" />} />
        <Metric title="유효 신청자" value={`${validCount.toLocaleString("ko-KR")}명`} note={`오류 ${errorCount.toLocaleString("ko-KR")}건 제외`} icon={<Users className="size-4" />} />
        <Metric title="최근 업데이트" value={jobs[0] ? formatDate(jobs[0].updated_at).split(" ").slice(0, 3).join(" ") : "없음"} note={jobs[0] ? formatDate(jobs[0].updated_at).split(" ").slice(3).join(" ") : "첫 작업을 만들어 보세요"} icon={<CalendarDays className="size-4" />} />
      </div>

      {error ? <Alert variant="destructive" className="mt-6"><AlertTitle>작업을 불러오지 못했습니다</AlertTitle><AlertDescription>{error.message}</AlertDescription></Alert> :
        jobs.length === 0 ? <Card className="mt-6"><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><span className="mb-4 grid size-12 place-items-center rounded-full bg-muted"><FileSpreadsheet className="size-5 text-muted-foreground" /></span><h2 className="font-semibold">저장된 작업이 없습니다</h2><p className="mt-2 text-sm text-muted-foreground">CSV를 가져와 첫 번째 작업을 만들어 보세요.</p><Button asChild className="mt-5"><Link href="/services/course-roster/new"><Plus />새 작업</Link></Button></CardContent></Card> :
        <Card className="mt-6 overflow-hidden"><Table><TableHeader><TableRow><TableHead>작업명</TableHead><TableHead>기본 강의명</TableHead><TableHead className="text-right">유효 인원</TableHead><TableHead className="text-right">오류</TableHead><TableHead>버전</TableHead><TableHead>상태</TableHead><TableHead>업데이트</TableHead><TableHead><span className="sr-only">작업</span></TableHead></TableRow></TableHeader><TableBody>{jobs.map((job) => <TableRow key={job.id}><TableCell className="font-medium"><Link className="hover:underline" href={`/services/course-roster/${job.id}`}>{job.name}</Link></TableCell><TableCell className="text-muted-foreground">{job.default_course_name || "CSV 내 강의명"}</TableCell><TableCell className="text-right font-mono">{job.valid_count}</TableCell><TableCell className="text-right font-mono">{job.error_count}</TableCell><TableCell className="font-mono">v{job.latest_version}</TableCell><TableCell><Badge variant={job.status === "ready" ? "default" : "secondary"}>{STATUS_LABELS[job.status] ?? job.status}</Badge></TableCell><TableCell className="text-muted-foreground">{formatDate(job.updated_at)}</TableCell><TableCell><div className="flex items-center gap-1"><Button variant="outline" size="sm" asChild><Link href={`/services/course-roster/${job.id}`}>상세보기</Link></Button><DeleteJobButton jobId={job.id} jobName={job.name} /></div></TableCell></TableRow>)}</TableBody></Table></Card>}
    </div>
  </main>;
}

function Metric({ title, value, note, icon }: { title: string; value: string; note: string; icon: React.ReactNode }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">{title}{icon}</CardTitle></CardHeader><CardContent><strong className="text-2xl">{value}</strong><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card>;
}
