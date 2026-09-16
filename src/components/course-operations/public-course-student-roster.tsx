"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  formatOrderStudentPhone,
  summarizeOrderStudents,
  type OrderStudent,
} from "@/lib/course-orders/student-roster";

const PAGE_SIZE = 50;

export function PublicCourseStudentRoster({ students }: { students: OrderStudent[] }) {
  const [query, setQuery] = useState("");
  const [option, setOption] = useState("");
  const [page, setPage] = useState(1);
  const summary = useMemo(() => summarizeOrderStudents(students), [students]);
  const filtered = useMemo(() => {
    const keyword = query.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
    return students.filter((student) => {
      if (option && student.optionName !== option) return false;
      if (!keyword) return true;
      return [student.name, student.phone, student.email, student.optionName]
        .some((value) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").includes(keyword));
    });
  }, [option, query, students]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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

      <div className="rounded-xl border bg-card">
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_240px]">
          <label className="relative">
            <span className="sr-only">수강생 검색</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="이름·전화번호·이메일 검색" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          </label>
          <select aria-label="옵션 필터" className="h-10 rounded-lg border border-input bg-background px-3 text-sm" value={option} onChange={(event) => { setOption(event.target.value); setPage(1); }}>
            <option value="">전체 옵션</option>
            {summary.options.map((item) => <option key={item.optionName} value={item.optionName}>{item.optionName || "옵션 없음"}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <Table aria-label="공유 수강생 명단">
            <TableHeader><TableRow>
              <TableHead>번호</TableHead><TableHead>이름</TableHead><TableHead>전화번호</TableHead><TableHead>이메일</TableHead><TableHead>옵션명</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visible.map((student, index) => (
                <TableRow key={student.orderId}>
                  <TableCell className="tabular-nums">{(currentPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                  <TableCell className="font-medium">{student.name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatOrderStudentPhone(student.phone)}</TableCell>
                  <TableCell>{student.email || "—"}</TableCell>
                  <TableCell>{student.optionName || "—"}</TableCell>
                </TableRow>
              ))}
              {!visible.length ? <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">조건에 맞는 수강생이 없습니다.</TableCell></TableRow> : null}
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

