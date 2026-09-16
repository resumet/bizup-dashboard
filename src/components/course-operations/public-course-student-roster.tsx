"use client";

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createOrderStudentCsv,
  formatOrderStudentPhone,
  summarizeOrderStudents,
  type OrderStudent,
} from "@/lib/course-orders/student-roster";

const PAGE_SIZE = 50;
const CHART_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#4f46e5", "#ca8a04"];

type ChartItem = { label: string; people: number };

function RosterPieChart({ id, title, description, items }: { id: string; title: string; description: string; items: ChartItem[] }) {
  const total = items.reduce((sum, item) => sum + item.people, 0);
  let offset = 0;
  const background = total
    ? `conic-gradient(${items.map((item, index) => {
      const start = offset;
      offset += item.people / total * 100;
      return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${offset}%`;
    }).join(", ")})`
    : "var(--muted)";

  return (
    <section className="rounded-xl border bg-card p-5" aria-labelledby={id}>
      <div className="mb-5">
        <h2 id={id} className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid items-center gap-6 md:grid-cols-[220px_1fr]">
        <div
          className="relative mx-auto aspect-square w-full max-w-[220px] rounded-full"
          style={{ backgroundImage: background }}
          role="img"
          aria-label={`${title} 분포: ${items.map((item) => `${item.label} ${item.people}명`).join(", ") || "데이터 없음"}`}
        >
          <div className="absolute inset-[27%] flex flex-col items-center justify-center rounded-full bg-card shadow-sm">
            <span className="text-2xl font-semibold tabular-nums">{total.toLocaleString("ko-KR")}</span>
            <span className="text-xs text-muted-foreground">구분별 합계</span>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <li key={item.label} className="flex items-center gap-3 rounded-lg border p-3">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
              <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
              <span className="whitespace-nowrap font-medium tabular-nums">
                {item.people.toLocaleString("ko-KR")}명
                <span className="ml-1 text-xs font-normal text-muted-foreground">({total ? (item.people / total * 100).toFixed(1) : "0.0"}%)</span>
              </span>
            </li>
          ))}
          {!items.length ? <li className="text-sm text-muted-foreground">표시할 데이터가 없습니다.</li> : null}
        </ul>
      </div>
    </section>
  );
}

export function PublicCourseStudentRoster({ courseName, students }: { courseName: string; students: OrderStudent[] }) {
  const [query, setQuery] = useState("");
  const [option, setOption] = useState("");
  const [inflowType, setInflowType] = useState("");
  const [page, setPage] = useState(1);
  const summary = useMemo(() => summarizeOrderStudents(students), [students]);
  const inflowTypes = useMemo(() => [...new Set(students.map((student) => student.inflowType))].sort((a, b) => a.localeCompare(b, "ko-KR")), [students]);
  const optionChartItems = useMemo(() => [...summary.options]
    .sort((a, b) => b.people - a.people || a.optionName.localeCompare(b.optionName, "ko-KR"))
    .map((item) => ({ label: item.optionName || "옵션 없음", people: item.people })), [summary.options]);
  const inflowChartItems = useMemo(() => summary.inflowTypes
    .map((item) => ({ label: item.inflowType || "유입구분 없음", people: item.people })), [summary.inflowTypes]);
  const filtered = useMemo(() => {
    const keyword = query.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
    return students.filter((student) => {
      if (option && student.optionName !== option) return false;
      if (inflowType && student.inflowType !== inflowType) return false;
      if (!keyword) return true;
      return [student.name, student.phone, student.email, student.optionName, student.inflowType]
        .some((value) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").includes(keyword));
    });
  }, [inflowType, option, query, students]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function downloadCsv() {
    const blob = new Blob([createOrderStudentCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeCourseName = courseName.replace(/[\\/:*?"<>|]/gu, "_").trim() || "수강생";
    anchor.href = url;
    anchor.download = `${safeCourseName}_수강생명단.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">결제완료</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.count.toLocaleString("ko-KR")}건</p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">중복 제외 수강생</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.people.toLocaleString("ko-KR")}명</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <RosterPieChart
          id="option-chart-title"
          title="옵션별 수강생"
          description="같은 옵션의 중복 결제는 한 명으로 계산합니다."
          items={optionChartItems}
        />
        <RosterPieChart
          id="inflow-chart-title"
          title="트래킹 유입구분별 수강생"
          description="같은 유입구분의 중복 결제는 한 명으로 계산합니다."
          items={inflowChartItems}
        />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="grid gap-3 border-b p-4 lg:grid-cols-[1fr_190px_190px_auto]">
          <label className="relative">
            <span className="sr-only">수강생 검색</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="이름·연락처·옵션·유입구분 검색" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          </label>
          <select aria-label="옵션 필터" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={option} onChange={(event) => { setOption(event.target.value); setPage(1); }}>
            <option value="">전체 옵션</option>
            {summary.options.map((item) => <option key={item.optionName} value={item.optionName}>{item.optionName || "옵션 없음"}</option>)}
          </select>
          <select aria-label="트래킹 유입구분 필터" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={inflowType} onChange={(event) => { setInflowType(event.target.value); setPage(1); }}>
            <option value="">전체 유입구분</option>
            {inflowTypes.map((item) => <option key={item} value={item}>{item || "유입구분 없음"}</option>)}
          </select>
          <Button type="button" variant="outline" onClick={downloadCsv} disabled={!filtered.length}>
            <Download />CSV 다운로드
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table aria-label="공유 수강생 명단">
            <TableHeader><TableRow>
              <TableHead>번호</TableHead><TableHead>이름</TableHead><TableHead>전화번호</TableHead><TableHead>이메일</TableHead><TableHead>옵션명</TableHead><TableHead>트래킹 유입구분</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visible.map((student, index) => (
                <TableRow key={student.orderId}>
                  <TableCell className="tabular-nums">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                  <TableCell className="font-medium">{student.name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatOrderStudentPhone(student.phone)}</TableCell>
                  <TableCell>{student.email || "—"}</TableCell>
                  <TableCell>{student.optionName || "—"}</TableCell>
                  <TableCell>{student.inflowType || "—"}</TableCell>
                </TableRow>
              ))}
              {!visible.length ? <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">조건에 맞는 수강생이 없습니다.</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
          <span>조회 {filtered.length.toLocaleString("ko-KR")}건 · {currentPage} / {pageCount}페이지</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>이전</Button>
            <Button type="button" variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>다음</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
