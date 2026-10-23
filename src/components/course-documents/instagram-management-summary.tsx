"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { instagramProgressSummary, progressPercentage } from "@/lib/course-documents/instagram-progress";
import type { CourseDocumentCourse } from "@/lib/course-documents/types";
import { formatWebinarDate } from "@/lib/course-operations/webinar-proximity";

type SummaryResponse = {
  courses?: CourseDocumentCourse[];
  message?: string;
};

function isOngoingCourse(course: CourseDocumentCourse) {
  return !["on_hold", "completed", "canceled"].includes(course.status ?? "");
}

export function InstagramManagementSummary() {
  const [courses, setCourses] = useState<CourseDocumentCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/instagram-management?view=list", { cache: "no-store" })
      .then(async (response) => ({ response, body: await response.json() as SummaryResponse }))
      .then(({ response, body }) => {
        if (!active) return;
        if (!response.ok || !body.courses) throw new Error(body.message ?? "인스타그램 진행 요약을 불러오지 못했습니다.");
        setCourses(body.courses.filter(isOngoingCourse));
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "인스타그램 진행 요약을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground"><Loader2 className="animate-spin" />불러오는 중</div>;
  }

  if (error) {
    return <Alert variant="destructive"><AlertTriangle /><AlertDescription>{error}</AlertDescription></Alert>;
  }

  const rows = courses.map((course) => ({
    course,
    progress: instagramProgressSummary(course.materials, course.freeWebinarAt),
  }));
  const totals = rows.reduce((result, row) => ({
    planned: result.planned + row.progress.totalCount,
    filmed: result.filmed + row.progress.filmingCompletedCount,
    uploaded: result.uploaded + row.progress.uploadCompletedCount,
  }), { planned: 0, filmed: 0, uploaded: 0 });

  return <section className="space-y-5">
    <h2 className="text-xl font-semibold">인스타그램 진행 요약</h2>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="space-y-1 pt-5"><p className="text-sm text-muted-foreground">전체 계획</p><p className="text-2xl font-semibold">{totals.planned}건</p></CardContent></Card>
      <Card><CardContent className="space-y-1 pt-5"><p className="text-sm text-muted-foreground">촬영 완료</p><p className="text-2xl font-semibold">{totals.filmed}건 ({progressPercentage(totals.filmed, totals.planned)}%)</p></CardContent></Card>
      <Card><CardContent className="space-y-1 pt-5"><p className="text-sm text-muted-foreground">업로드 완료</p><p className="text-2xl font-semibold">{totals.uploaded}건 ({progressPercentage(totals.uploaded, totals.planned)}%)</p></CardContent></Card>
    </div>
    <div className="overflow-x-auto rounded-lg border">
      <Table className="min-w-[1120px]">
        <TableHeader><TableRow><TableHead>강의</TableHead><TableHead>강사</TableHead><TableHead>기수</TableHead><TableHead>웨비나 날짜</TableHead><TableHead className="text-right">전체 계획</TableHead><TableHead className="text-right">촬영 완료</TableHead><TableHead className="text-right">업로드 완료</TableHead><TableHead className="min-w-72">오늘 기준 업로드</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(({ course, progress }) => <TableRow key={course.id}>
          <TableCell><Link className="font-medium hover:underline" href={`/services/content-management/${course.id}?tab=instagram`}>{course.name}</Link></TableCell>
          <TableCell>{course.instructorName || "—"}</TableCell>
          <TableCell>{course.cohort || "—"}</TableCell>
          <TableCell><time dateTime={course.freeWebinarAt || undefined}>{formatWebinarDate(course.freeWebinarAt)}</time></TableCell>
          <TableCell className="text-right font-medium">{progress.totalCount}건</TableCell>
          <TableCell className="text-right">{progress.filmingCompletedCount}건 ({progressPercentage(progress.filmingCompletedCount, progress.totalCount)}%)</TableCell>
          <TableCell className="text-right">{progress.uploadCompletedCount}건 ({progressPercentage(progress.uploadCompletedCount, progress.totalCount)}%)</TableCell>
          <TableCell>{progress.requiredUploadCount === null
            ? <span className="text-muted-foreground">웨비나 날짜 필요</span>
            : <div className="flex flex-wrap items-center gap-2">
                <Badge variant={progress.uploadShortfallCount ? "destructive" : "outline"}>{progress.uploadShortfallCount ? `${progress.uploadShortfallCount}건 부족` : "일정 충족"}</Badge>
                <span className="text-sm text-muted-foreground">최소 {progress.requiredUploadCount}건 · 현재 {progress.uploadCompletedCount}건</span>
              </div>}
          </TableCell>
        </TableRow>)}</TableBody>
      </Table>
      {!rows.length ? <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">진행 중인 강의가 없습니다.</div> : null}
    </div>
  </section>;
}
