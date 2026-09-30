import Link from "next/link";
import { ArrowRight, BookOpenCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StudentSettlementCourseSummary } from "@/lib/course-operations/student-settlement-summary";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
  })}원`;
}

export function StudentSettlementCourseList({
  courses,
}: {
  courses: StudentSettlementCourseSummary[];
}) {
  if (!courses.length) {
    return (
      <Card className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <BookOpenCheck className="size-5" />
        </span>
        <h2 className="font-semibold">관리할 강의가 없습니다</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          강의 운영에서 강의를 만든 뒤 주문과 수강생 정보를 관리할 수 있습니다.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden py-0">
      <div className="overflow-x-auto">
        <Table className="min-w-[940px]">
          <TableHeader>
            <TableRow>
              <TableHead>강의명</TableHead>
              <TableHead>웨비나 날짜</TableHead>
              <TableHead className="text-right">주문</TableHead>
              <TableHead className="text-right">전체 결제금액</TableHead>
              <TableHead className="text-right">유료수강생</TableHead>
              <TableHead className="text-right">전체 비용</TableHead>
              <TableHead className="w-28 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.map((course) => {
              const href = `/services/course-operations/students-settlements/${course.id}`;
              return (
                <TableRow key={course.id}>
                  <TableCell>
                    <Link href={href} className="font-medium hover:underline">
                      {course.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {course.cohort ? `${course.cohort}기 · ` : ""}
                      {course.instructor_name || "강사 미등록"}
                    </p>
                  </TableCell>
                  <TableCell>{formatDate(course.free_webinar_at)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {course.order_count.toLocaleString("ko-KR")}건
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(course.payment_amount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {course.paid_student_count.toLocaleString("ko-KR")}명
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(course.total_cost)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={href}>
                        열기
                        <ArrowRight />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
