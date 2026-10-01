"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { CoursePaymentSummaryTable } from "@/components/course-operations/course-payment-summary";
import { StudentSettlementCourseList } from "@/components/course-operations/student-settlement-course-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CoursePaymentSummary } from "@/lib/course-operations/payment-summary";
import type { StudentSettlementCourseSummary } from "@/lib/course-operations/student-settlement-summary";

type OverviewTab = "courses" | "paid-students" | "payments";

export function StudentSettlementOverview({
  courses,
}: {
  courses: StudentSettlementCourseSummary[];
}) {
  const [paymentSummaries, setPaymentSummaries] = useState<CoursePaymentSummary[] | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");

  async function changeTab(value: string) {
    const nextTab = value as OverviewTab;
    if (nextTab !== "payments" || paymentSummaries || paymentLoading) return;

    setPaymentLoading(true);
    setPaymentError("");
    try {
      const response = await fetch("/api/course-operations/payment-summary", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as
        | CoursePaymentSummary[]
        | { message?: string }
        | null;
      if (!response.ok || !Array.isArray(body)) {
        throw new Error(
          body && !Array.isArray(body) && body.message
            ? body.message
            : "전체 결제내역을 불러오지 못했습니다.",
        );
      }
      setPaymentSummaries(body);
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : "전체 결제내역을 불러오지 못했습니다.",
      );
    } finally {
      setPaymentLoading(false);
    }
  }

  return (
    <Tabs defaultValue="courses" onValueChange={(value) => void changeTab(value)} className="gap-6">
      <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:w-fit sm:min-w-[28rem]">
        <TabsTrigger value="courses" className="h-10 px-3">
          강의별 현황
        </TabsTrigger>
        <TabsTrigger value="paid-students" className="h-10 px-3">
          유료수강생
        </TabsTrigger>
        <TabsTrigger value="payments" className="h-10 px-3">
          전체 결제내역
        </TabsTrigger>
      </TabsList>

      <TabsContent value="courses" className="mt-0">
        <StudentSettlementCourseList courses={courses} />
      </TabsContent>

      <TabsContent value="paid-students" className="mt-0">
        <Card className="overflow-hidden py-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead>강의명</TableHead>
                  <TableHead>기수</TableHead>
                  <TableHead>강사명</TableHead>
                  <TableHead className="text-right">유료수강생</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((course) => (
                  <TableRow key={course.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/services/course-operations/students-settlements/${course.id}?tab=paid-students`}
                        className="hover:underline"
                      >
                        {course.name}
                      </Link>
                    </TableCell>
                    <TableCell>{course.cohort ? `${course.cohort}기` : "-"}</TableCell>
                    <TableCell>{course.instructor_name || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {course.paid_student_count.toLocaleString("ko-KR")}명
                    </TableCell>
                  </TableRow>
                ))}
                {!courses.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                      등록된 강의가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="payments" className="mt-0">
        {paymentLoading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" />
            전체 결제내역을 불러오는 중입니다.
          </div>
        ) : paymentError ? (
          <Alert variant="destructive">
            <AlertTitle>전체 결제내역을 불러오지 못했습니다</AlertTitle>
            <AlertDescription>{paymentError}</AlertDescription>
          </Alert>
        ) : paymentSummaries ? (
          <CoursePaymentSummaryTable summaries={paymentSummaries} />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
