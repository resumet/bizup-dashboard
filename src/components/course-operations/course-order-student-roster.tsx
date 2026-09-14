"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { OrderStudent } from "@/lib/course-orders/student-roster";

const PAGE_SIZE = 50;

export function CourseOrderStudentRoster({ students }: { students: OrderStudent[] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(students.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = students.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <section aria-label="결제완료 수강생 명단">
    <Card>
      <CardHeader>
        <CardTitle>결제완료 수강생 명단</CardTitle>
        <CardDescription>전체 주문 중 결제완료 {students.length.toLocaleString("ko-KR")}건 · 금액은 원본 결제금액입니다. 같은 사람의 다른 주문·옵션은 각각 표시합니다.</CardDescription>
        <p className="text-xs text-muted-foreground">주문 필터와 관계없이 표시하며, 주문을 새로 불러오면 명단도 갱신됩니다.</p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>이름</TableHead><TableHead>전화번호</TableHead><TableHead>이메일</TableHead><TableHead>옵션명</TableHead><TableHead className="text-right">금액</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {visible.map((student) => <TableRow key={student.orderId}>
                <TableCell className="font-medium">{student.name || "—"}</TableCell>
                <TableCell>{student.phone || "—"}</TableCell>
                <TableCell>{student.email || "—"}</TableCell>
                <TableCell className="min-w-40 max-w-80 whitespace-normal break-words">{student.optionName || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{student.amount.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원</TableCell>
              </TableRow>)}
              {!students.length && <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">결제완료인 주문이 없습니다.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
        {pageCount > 1 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>{currentPage} / {pageCount}페이지 · 페이지당 {PAGE_SIZE}건</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>이전</Button>
            <Button type="button" variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>다음</Button>
          </div>
        </div>}
      </CardContent>
    </Card>
  </section>;
}
