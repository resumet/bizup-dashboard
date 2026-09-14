"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMetric, ratio, ratioDefinitions, summarizeWebinars, webinarFields, type WebinarCourse } from "@/lib/course-webinars/metrics";

const metricHeadings = {
  group_chat_count: ["최종 단톡", "인원 (명)"], communication_count: ["소통방", "인원 (명)"],
  live_start_count: ["라이브", "시작 (명)"], live_peak_count: ["라이브", "최대 (명)"],
  hours_to_peak: ["최대 도달", "시간 (h)"], live_end_count: ["라이브", "종료 (명)"],
  ad_spend: ["광고비", "(원)"], payment_count: ["결제", "건수 (건)"], revenue: ["총 매출", "(원)"],
} as const;
const ratioHeadings = {
  chatToLive: ["단톡 → (%)", "라이브 최대"], liveToPayment: ["라이브 최대", "→ 결제 (%)"],
  chatToPayment: ["단톡 →", "결제 (%)"], roas: ["ROAS", "(%)"],
} as const;
const headClass = "h-auto px-1 py-3 text-center text-[11px] leading-5 whitespace-normal 2xl:text-xs";
const metricCellClass = "flex min-w-0 flex-col gap-1 px-3 py-2 whitespace-normal [overflow-wrap:anywhere] xl:table-cell xl:px-1 xl:text-right xl:tabular-nums";

function TwoLineHeading({ lines }: { lines: readonly [string, string] }) {
  return <>{lines.map((line, index) => <span key={index} className="block whitespace-nowrap">{line}</span>)}</>;
}

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
          <p className="text-xs leading-5 text-muted-foreground">—는 미입력 또는 분모 0입니다. 모든 라이브 전환율은 최대 인원을 기준으로 계산합니다. 구매 전환율은 결제 건수 기준이며 고유 구매자 비율과 다를 수 있습니다. 소통방 인원은 단톡방에 합산하지 않습니다. 최대 도달 시간은 라이브 시작부터의 경과 시간입니다.</p>
          <div className="w-full min-w-0 xl:rounded-lg xl:border" role="region" aria-label="강의별 웨비나 실적 표">
            <table className="block w-full table-fixed text-sm xl:table xl:text-xs 2xl:text-sm">
              <colgroup className="hidden xl:table-column-group">
                <col style={{ width: "18%" }} /><col style={{ width: "7%" }} />
                {webinarFields.map(field => <col key={field.key} style={{ width: field.key === "ad_spend" || field.key === "revenue" ? "8%" : "5%" }} />)}
                {ratioDefinitions.map(definition => <col key={definition.key} style={{ width: "6%" }} />)}
              </colgroup>
              <TableHeader className="sr-only xl:not-sr-only xl:table-header-group"><TableRow>
                <TableHead scope="col" className={headClass}><TwoLineHeading lines={["강의", "강사"]} /></TableHead>
                <TableHead scope="col" className={headClass}><TwoLineHeading lines={["웨비나", "일자"]} /></TableHead>
                {webinarFields.map(field => <TableHead scope="col" key={field.key} className={headClass} aria-label={`${field.label} (${field.unit})`}><TwoLineHeading lines={metricHeadings[field.key]} /></TableHead>)}
                {ratioDefinitions.map(definition => <TableHead scope="col" key={definition.key} className={headClass} aria-label={`${definition.label} (%)`}><TwoLineHeading lines={ratioHeadings[definition.key]} /></TableHead>)}
              </TableRow></TableHeader>
              <TableBody className="grid gap-4 xl:table-row-group">
                {filtered.slice(currentPage * 20, currentPage * 20 + 20).map(course => <TableRow key={course.id} className="grid grid-cols-2 rounded-lg border pb-2 sm:grid-cols-3 xl:table-row xl:rounded-none xl:border-x-0 xl:border-t-0 xl:pb-0">
                  <TableCell className="col-span-full min-w-0 whitespace-normal [overflow-wrap:anywhere] xl:px-2"><Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/services/course-operations/${course.id}?tab=webinar`}>{course.name}</Link><p className="mt-1 text-xs text-muted-foreground">{course.instructor_name}{!course.metrics || webinarFields.every(({ key }) => course.metrics![key] === null) ? " · 미입력" : ""}</p></TableCell>
                  <TableCell className="col-span-full px-3 text-xs whitespace-normal xl:px-1 xl:text-center"><span className="mr-2 text-muted-foreground xl:hidden" aria-hidden="true">웨비나 일자</span><time dateTime={course.free_webinar_at} className="[overflow-wrap:anywhere]">{new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(course.free_webinar_at))}</time></TableCell>
                  {webinarFields.map(field => <TableCell key={field.key} className={metricCellClass}><span className="text-xs text-muted-foreground xl:hidden" aria-hidden="true">{field.label} ({field.unit})</span>{formatMetric(course.metrics?.[field.key])}</TableCell>)}
                  {ratioDefinitions.map(definition => <TableCell key={definition.key} className={metricCellClass}><span className="text-xs text-muted-foreground xl:hidden" aria-hidden="true">{definition.label}</span>{formatMetric(ratio(course.metrics?.[definition.numerator] ?? null, course.metrics?.[definition.denominator] ?? null), "%")}</TableCell>)}
                </TableRow>)}
                {!filtered.length && <TableRow className="block xl:table-row"><TableCell colSpan={15} className="block h-auto py-10 text-center whitespace-normal text-muted-foreground xl:table-cell">{courses.length ? "조회 조건에 맞는 강의가 없습니다." : "등록된 강의가 없습니다. 강의 운영 자동화에서 강의를 만들어 주세요."}</TableCell></TableRow>}
              </TableBody>
            </table>
          </div>
          {filtered.length > 20 && <div className="flex items-center justify-end gap-3"><Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>이전</Button><span className="text-sm">{currentPage + 1} / {Math.ceil(filtered.length / 20)}</span><Button variant="outline" size="sm" disabled={(currentPage + 1) * 20 >= filtered.length} onClick={() => setPage(currentPage + 1)}>다음</Button></div>}
        </>}
      </CardContent>
    </Card>
  </section>;
}
