"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMetric, ratio, ratioDefinitions, summarizeWebinars, webinarFields, type WebinarCourse } from "@/lib/course-webinars/metrics";

export function WebinarDashboard() {
  const [courses, setCourses] = useState<WebinarCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/course-webinars", { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "웨비나 실적을 불러오지 못했습니다.");
      setCourses(body.items); setError("");
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  const filtered = useMemo(() => courses.filter(course => `${course.name} ${course.instructor_name}`.toLowerCase().includes(search.trim().toLowerCase()) && (!month || new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date(course.free_webinar_at)) === month)), [courses, search, month]);
  const summary = useMemo(() => summarizeWebinars(filtered), [filtered]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 20) - 1));
  return <section className="mt-10 min-w-0" aria-label="라이브 웨비나 대시보드">
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-xl">라이브 웨비나 대시보드</CardTitle><Button variant="outline" size="sm" disabled={loading} onClick={() => { setLoading(true); setReload(value => value + 1); }}>실적 새로고침</Button></div>
        <CardDescription>접근 가능한 모든 강의의 라이브 실적과 전환율을 비교합니다. 강의명을 누르면 입력 탭으로 이동합니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-3">
          <Input aria-label="웨비나 강의·강사 검색" placeholder="강의명 또는 강사명 검색" className="sm:max-w-xs" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
          <Input aria-label="웨비나 개최 월" type="month" className="w-auto max-w-full" value={month} onChange={event => { setMonth(event.target.value); setPage(0); }} />
          {(search || month) && <Button variant="ghost" onClick={() => { setSearch(""); setMonth(""); setPage(0); }}>전체 보기</Button>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading && <p role="status" className="text-sm text-muted-foreground">웨비나 실적을 불러오는 중입니다.</p>}
        {!loading && !error && <>
          <p className="text-sm text-muted-foreground">조회 {filtered.length}개 강의 · 실적 입력 {summary.entered}개 · 집계는 현재 조회된 전체 강의 기준</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {([['ad_spend', '총 광고비', '원'], ['payment_count', '총 결제', '건'], ['revenue', '총 매출', '원']] as const).map(([key, label, unit]) => <div key={key} className="rounded-xl bg-muted/40 p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 break-all text-2xl font-semibold">{formatMetric(summary.totals[key], unit)}</p></div>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.ratios.map(item => <div key={item.key} className="rounded-xl border p-4"><p className="text-sm font-medium">{item.label}</p><p className="my-2 text-2xl font-semibold text-primary">{formatMetric(item.value, "%")}</p><p className="text-xs leading-5 text-muted-foreground">{item.formula}<br />두 값이 모두 입력된 {item.count}개 강의 합산</p></div>)}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">—는 미입력 또는 분모 0입니다. 단톡방 → 라이브는 시작 인원, 라이브 → 결제는 최대 인원을 기준으로 계산합니다. 구매 전환율은 결제 건수 기준이며 고유 구매자 비율과 다를 수 있습니다. 소통방 인원은 단톡방에 합산하지 않습니다. 최대 도달 시간은 라이브 시작부터의 경과 시간입니다.</p>
          <p className="text-xs text-muted-foreground">표를 좌우로 스크롤하면 종료 인원, 광고비, 결제, 매출과 강의별 전환율을 볼 수 있습니다.</p>
          <div className="max-w-full overflow-x-auto rounded-lg border" tabIndex={0} role="region" aria-label="강의별 웨비나 실적 표">
            <Table className="min-w-[1850px]">
              <TableHeader><TableRow><TableHead className="min-w-64">강의 / 강사</TableHead><TableHead>웨비나 일자</TableHead>{webinarFields.map(field => <TableHead key={field.key} className="text-right whitespace-nowrap">{field.label} ({field.unit})</TableHead>)}{ratioDefinitions.map(definition => <TableHead key={definition.key} className="text-right whitespace-nowrap">{definition.label}</TableHead>)}</TableRow></TableHeader>
              <TableBody>
                {filtered.slice(currentPage * 20, currentPage * 20 + 20).map(course => <TableRow key={course.id}>
                  <TableCell><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/services/course-operations/${course.id}?tab=webinar`}>{course.name}</Link><p className="mt-1 text-xs text-muted-foreground">{course.instructor_name}{!course.metrics || webinarFields.every(({ key }) => course.metrics![key] === null) ? " · 미입력" : ""}</p></TableCell>
                  <TableCell className="whitespace-nowrap">{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(course.free_webinar_at))}</TableCell>
                  {webinarFields.map(field => <TableCell key={field.key} className="text-right tabular-nums">{formatMetric(course.metrics?.[field.key])}</TableCell>)}
                  {ratioDefinitions.map(definition => <TableCell key={definition.key} className="text-right tabular-nums">{formatMetric(ratio(course.metrics?.[definition.numerator] ?? null, course.metrics?.[definition.denominator] ?? null), "%")}</TableCell>)}
                </TableRow>)}
                {!filtered.length && <TableRow><TableCell colSpan={15} className="h-24 text-center text-muted-foreground">{courses.length ? "조회 조건에 맞는 강의가 없습니다." : "등록된 강의가 없습니다. 강의 운영 자동화에서 강의를 만들어 주세요."}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 20 && <div className="flex items-center justify-end gap-3"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</Button><span className="text-sm">{currentPage + 1} / {Math.ceil(filtered.length / 20)}</span><Button variant="outline" size="sm" disabled={(currentPage + 1) * 20 >= filtered.length} onClick={() => setPage(currentPage + 1)}>다음</Button></div>}
        </>}
      </CardContent>
    </Card>
  </section>;
}
