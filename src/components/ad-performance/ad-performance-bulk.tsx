"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bulkComparisonNarrative, bulkMetricDefinitions, compareBulkMetric, formatBulkValue, type AdPerformanceBulkRow } from "@/lib/ad-performance/bulk";

const groups = [...new Set(bulkMetricDefinitions.map((item) => item.group))];
const statusStyle: Record<string, string> = {
  improved: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  weakened: "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200",
  neutral: "text-blue-700 dark:text-blue-300", missing: "text-muted-foreground", same: "text-muted-foreground",
};

function CourseComparison({ left, right, onSwap }: { left: AdPerformanceBulkRow; right: AdPerformanceBulkRow; onSwap: () => void }) {
  const compared = bulkMetricDefinitions.map((definition) => ({ definition, result: compareBulkMetric(definition, left.values[definition.key], right.values[definition.key]) }));
  const improvements = compared.filter((item) => item.result.status === "improved");
  const weaknesses = compared.filter((item) => item.result.status === "weakened");
  const missing = compared.filter((item) => item.result.status === "missing");
  const paragraphs = bulkComparisonNarrative(left, right);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold">강의 비교</h2>
      <Button variant="outline" onClick={onSwap}><ArrowLeftRight />기준·비교 바꾸기</Button></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {[{ row: left, label: "기준 강의" }, { row: right, label: "비교 강의" }].map(({ row, label }) => <Card key={label} size="sm">
        <CardContent><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 font-semibold">{row.name}</p>
          <p className="mt-1 text-sm">{row.instructorName}</p><p className="mt-2 text-xs text-muted-foreground">{row.startDate} ~ {row.endDate ?? "기록 없음"}</p></CardContent>
      </Card>)}
    </div>
    <Card><CardHeader><CardTitle>비교 분석 요약</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">개선 {improvements.length}개 지표</p>
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">약화 {weaknesses.length}개 지표</p>
        <p className="rounded-md bg-muted p-3 text-sm">비교 불가 {missing.length}개 지표</p>
      </div>
      <div className="space-y-2 text-sm leading-7">{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      {improvements.length ? <p className="text-sm leading-6"><strong>개선된 항목:</strong> {improvements.map((item) => item.definition.label).join(", ")}</p> : null}
      {weaknesses.length ? <p className="text-sm leading-6"><strong>약화된 항목:</strong> {weaknesses.map((item) => item.definition.label).join(", ")}</p> : null}
    </CardContent></Card>
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[660px] text-sm" aria-label="두 강의 성과 비교">
        <thead className="bg-muted"><tr><th scope="col" className="p-3 text-left">지표</th><th scope="col" className="p-3 text-right">기준: {left.name}</th><th scope="col" className="p-3 text-right">비교: {right.name}</th><th scope="col" className="p-3 text-left">변화</th></tr></thead>
        <tbody>{compared.map(({ definition, result }, index) => <tr key={definition.key} className="border-t">
          <th scope="row" className="p-3 text-left font-medium">{index === 0 || definition.group !== compared[index - 1].definition.group ? <span className="mb-1 block text-xs text-muted-foreground">{definition.group}</span> : null}{definition.label}</th>
          <td className="p-3 text-right tabular-nums">{formatBulkValue(left.values[definition.key], definition.unit)}</td>
          <td className={`p-3 text-right font-semibold tabular-nums ${statusStyle[result.status]}`}>{formatBulkValue(right.values[definition.key], definition.unit)}</td>
          <td className={`p-3 tabular-nums ${statusStyle[result.status]}`}>{result.label}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

export function AdPerformanceBulk({ rows }: { rows: AdPerformanceBulkRow[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const comparisonRef = useRef<HTMLElement>(null);
  const visible = rows.filter((row) => `${row.name} ${row.instructorName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const left = rows.find((row) => row.id === selected[0]);
  const right = rows.find((row) => row.id === selected[1]);
  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 2 ? [...current, id] : current);
  }
  return <main className="min-h-screen"><div className="mx-auto max-w-[1900px] space-y-6 px-5 py-8 lg:px-8">
    <div className="flex items-center gap-2"><Button variant="ghost" size="icon-sm" asChild><Link href="/services/ad-performance/daily" aria-label="광고성과 관리로 돌아가기"><ArrowLeft /></Link></Button><h1 className="text-3xl font-semibold tracking-tight">광고성과 일괄 보기</h1></div>
    {rows.some((row) => row.error) ? <p role="alert" className="rounded-lg border border-destructive p-4 text-sm text-destructive">일부 웨비나·유료수강생 실적을 불러오지 못했습니다. 해당 강의의 상세 화면을 확인하거나 새로고침해 주세요.</p> : null}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <label className="block w-full max-w-sm text-sm font-medium">강의·강사 검색<Input className="mt-2" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="강의명 또는 강사명" /></label>
      <div className="space-y-2"><p className="text-sm text-muted-foreground" aria-live="polite">비교할 강의 {selected.length}/2개 선택 · 먼저 선택한 강의가 기준입니다.</p>
        <div className="flex gap-2"><Button disabled={!left || !right} onClick={() => comparisonRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>선택한 2개 강의 비교</Button><Button variant="outline" disabled={!selected.length} onClick={() => setSelected([])}>선택 초기화</Button></div>
      </div>
    </div>
    <div className="max-h-[65vh] overflow-auto rounded-lg border">
      <table className="w-full border-separate border-spacing-0 text-sm" aria-label="전체 강의 광고성과">
        <thead className="sticky top-0 z-20 bg-muted">
          <tr><th rowSpan={2} scope="col" className="sticky left-0 z-30 w-14 min-w-14 bg-muted p-3 whitespace-nowrap">선택</th><th rowSpan={2} scope="col" className="sticky left-14 z-30 min-w-52 bg-muted p-3 text-left">강의</th><th rowSpan={2} scope="col" className="min-w-52 p-3 text-left">집계 기간</th>
            {groups.map((group) => <th key={group} scope="colgroup" colSpan={bulkMetricDefinitions.filter((item) => item.group === group).length} className="border-l p-3 text-center">{group}</th>)}
          </tr><tr>{bulkMetricDefinitions.map((definition) => <th key={definition.key} scope="col" className="min-w-36 border-t p-3 text-right whitespace-nowrap">{definition.label}</th>)}</tr>
        </thead>
        <tbody>{visible.map((row) => <tr key={row.id} className={selected.includes(row.id) ? "bg-primary/5" : ""}>
          <td className="sticky left-0 z-10 border-t bg-background p-3 text-center"><input type="checkbox" className="size-4 accent-primary" aria-label={`${row.instructorName} ${row.name} 비교 선택`} checked={selected.includes(row.id)} disabled={selected.length >= 2 && !selected.includes(row.id)} onChange={() => toggle(row.id)} /></td>
          <th scope="row" className="sticky left-14 z-10 border-t bg-background p-3 text-left font-medium"><Link href={row.href} className="text-primary hover:underline">{row.name}</Link><span className="mt-1 block text-xs text-muted-foreground">{row.instructorName}</span>{row.error ? <span className="mt-1 block text-xs text-destructive">일부 실적 조회 실패</span> : null}</th>
          <td className="border-t p-3 whitespace-nowrap">{row.startDate} ~ {row.endDate ?? "기록 없음"}</td>
          {bulkMetricDefinitions.map((definition) => <td key={definition.key} className="border-t p-3 text-right whitespace-nowrap tabular-nums">{formatBulkValue(row.values[definition.key], definition.unit)}</td>)}
        </tr>)}</tbody>
      </table>
      {!visible.length ? <p className="p-8 text-center text-sm text-muted-foreground">{rows.length ? "검색 결과가 없습니다." : "등록된 광고성과 대시보드가 없습니다."}</p> : null}
    </div>
    <p className="text-xs text-muted-foreground">표를 좌우로 스크롤하면 매체별 접수 DB·단가·전환율·매출을 모두 볼 수 있습니다. — 표시는 미입력 또는 계산 불가입니다.</p>
    <section ref={comparisonRef} className="scroll-mt-6" aria-label="강의 비교">
      {left && right ? <CourseComparison left={left} right={right} onSwap={() => setSelected(([first, second]) => [second, first])} /> : <Card><CardContent className="py-8 text-sm text-muted-foreground">표에서 비교할 강의 2개를 선택하면 인원·전환율·접수 단가·매출의 차이와 분석 요약이 표시됩니다.</CardContent></Card>}
    </section>
  </div></main>;
}
