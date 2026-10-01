"use client";

import Link from "next/link";
import { useRef, useState } from "react";
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
import { buildPaymentSummaryUpdate, type PaymentSummaryPatch } from "@/lib/course-operations/payment-summary-patch";
import type { StudentSettlementCourseSummary } from "@/lib/course-operations/student-settlement-summary";

type OverviewTab = "courses" | "paid-students" | "payments";
type SettlementDetails = Pick<CoursePaymentSummary, "cohort" | "nova_settled" | "instructor_settled">;

export function StudentSettlementOverview({
  courses: initialCourses,
}: {
  courses: StudentSettlementCourseSummary[];
}) {
  const [paymentSummaries, setPaymentSummaries] = useState<CoursePaymentSummary[] | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  // Keep edits above the tab panels so an in-flight save survives tab changes.
  const [details, setDetails] = useState<Record<string, SettlementDetails>>(() =>
    Object.fromEntries(initialCourses.map((course) => [course.id, {
      cohort: course.cohort, nova_settled: course.nova_settled, instructor_settled: course.instructor_settled,
    }])),
  );
  const pendingIds = useRef(new Set<string>());
  const [savingIds, setSavingIds] = useState(new Set<string>());
  const [savedIds, setSavedIds] = useState(new Set<string>());
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const courses = initialCourses.map((course) => ({ ...course, ...details[course.id] }));
  const syncedPayments = paymentSummaries?.map((course) => ({ ...course, ...details[course.id] }));

  async function saveSummary(courseId: string, patch: PaymentSummaryPatch) {
    const previous = details[courseId];
    if (!previous || pendingIds.current.has(courseId)) return;
    pendingIds.current.add(courseId);
    setSavingIds(new Set(pendingIds.current));
    setSavedIds((current) => { const next = new Set(current); next.delete(courseId); return next; });
    setSaveErrors((current) => ({ ...current, [courseId]: "" }));
    const update = buildPaymentSummaryUpdate(patch);
    setDetails((current) => ({ ...current, [courseId]: { ...current[courseId], ...update } }));
    try {
      const response = await fetch(`/api/course-operations/${courseId}/payment-summary`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message ?? "정산 정보를 저장하지 못했습니다.");
      setSavedIds((current) => new Set(current).add(courseId));
    } catch (error) {
      setDetails((current) => ({ ...current, [courseId]: previous }));
      const name = initialCourses.find((course) => course.id === courseId)?.name
        ?? paymentSummaries?.find((course) => course.id === courseId)?.name ?? "강의";
      setSaveErrors((current) => ({
        ...current,
        [courseId]: `${name}: ${error instanceof Error ? error.message : "정산 정보를 저장하지 못했습니다."}`,
      }));
    } finally {
      pendingIds.current.delete(courseId);
      setSavingIds(new Set(pendingIds.current));
    }
  }

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
      setDetails((current) => ({
        // A delayed GET must not replace a newer checkbox edit.
        ...Object.fromEntries(body.map((course) => [course.id, {
          cohort: course.cohort, nova_settled: course.nova_settled, instructor_settled: course.instructor_settled,
        }])),
        ...current,
      }));
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

      {Object.entries(saveErrors).filter(([, message]) => message).map(([id, message]) => (
        <p key={id} className="text-sm text-destructive" role="alert">{message}</p>
      ))}
      <span className="sr-only" role="status">
        {savingIds.size ? "정산 정보를 저장하는 중입니다." : savedIds.size ? "정산 정보를 저장했습니다." : ""}
      </span>

      <TabsContent value="courses" className="mt-0">
        <StudentSettlementCourseList courses={courses} savingIds={savingIds} savedIds={savedIds} onSave={saveSummary} />
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
        ) : syncedPayments ? (
          <CoursePaymentSummaryTable summaries={syncedPayments} savingIds={savingIds} savedIds={savedIds} onSave={saveSummary} />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
