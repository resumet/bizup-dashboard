"use client";

import { useRef, useState } from "react";

import { StudentSettlementCourseList } from "@/components/course-operations/student-settlement-course-list";
import { buildPaymentSummaryUpdate, type PaymentSummaryPatch } from "@/lib/course-operations/payment-summary-patch";
import type { StudentSettlementCourseSummary } from "@/lib/course-operations/student-settlement-summary";

type SettlementDetails = Pick<StudentSettlementCourseSummary, "nova_settled" | "instructor_settled">;

export function StudentSettlementOverview({
  courses: initialCourses,
}: {
  courses: StudentSettlementCourseSummary[];
}) {
  const [details, setDetails] = useState<Record<string, SettlementDetails>>(() =>
    Object.fromEntries(initialCourses.map((course) => [course.id, {
      nova_settled: course.nova_settled, instructor_settled: course.instructor_settled,
    }])),
  );
  const pendingIds = useRef(new Set<string>());
  const [savingIds, setSavingIds] = useState(new Set<string>());
  const [savedIds, setSavedIds] = useState(new Set<string>());
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const courses = initialCourses.map((course) => ({ ...course, ...details[course.id] }));

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
      const name = initialCourses.find((course) => course.id === courseId)?.name ?? "강의";
      setSaveErrors((current) => ({
        ...current,
        [courseId]: `${name}: ${error instanceof Error ? error.message : "정산 정보를 저장하지 못했습니다."}`,
      }));
    } finally {
      pendingIds.current.delete(courseId);
      setSavingIds(new Set(pendingIds.current));
    }
  }

  return (
    <div className="space-y-3">
      {Object.entries(saveErrors).filter(([, message]) => message).map(([id, message]) => (
        <p key={id} className="text-sm text-destructive" role="alert">{message}</p>
      ))}
      <span className="sr-only" role="status">
        {savingIds.size ? "정산 정보를 저장하는 중입니다." : savedIds.size ? "정산 정보를 저장했습니다." : ""}
      </span>

      <StudentSettlementCourseList courses={courses} savingIds={savingIds} savedIds={savedIds} onSave={saveSummary} />
    </div>
  );
}
