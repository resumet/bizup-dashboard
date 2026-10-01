"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { CourseCostManager } from "@/components/course-costs/course-cost-manager";
import { CourseOrdersManager } from "@/components/course-operations/course-orders-manager";
import { CourseSettlementManager } from "@/components/course-settlements/course-settlement-manager";
import { StudentSettlementReset } from "./student-settlement-reset";
import type { StudentSettlementResetTarget } from "@/lib/course-operations/student-settlement-reset";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export type StudentSettlementTab =
  | "orders"
  | "paid-students"
  | "costs"
  | "settlement";

export function StudentSettlementWorkspace({
  courseId,
  initialCourseName,
  instructorName,
  initialTab,
  paidRoster,
}: {
  courseId: string;
  initialCourseName: string;
  instructorName: string;
  initialTab: StudentSettlementTab;
  paidRoster: ReactNode;
}) {
  const [activeTab, setActiveTab] =
    useState<StudentSettlementTab>(initialTab);
  const [courseName, setCourseName] = useState(initialCourseName);
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [ordersRevision, setOrdersRevision] = useState(0);
  const [resetNotice, setResetNotice] = useState("");

  function handleReset(target: StudentSettlementResetTarget, count: number) {
    if (target === "orders") setOrdersRevision((current) => current + 1);
    setResetNotice(target === "orders"
      ? `주문내역 ${count.toLocaleString("ko-KR")}건을 리셋했습니다.`
      : `유료수강생 ${count.toLocaleString("ko-KR")}명의 현재 명단을 리셋했습니다. 이전 명단·발송 이력은 유지됩니다.`);
    startRefresh(() => router.refresh());
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as StudentSettlementTab)}
      className="gap-6"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <TabsList className="grid h-auto w-full min-w-0 flex-1 grid-cols-2 gap-1 md:grid-cols-4">
          <TabsTrigger value="orders" className="h-10">
            주문내역
          </TabsTrigger>
          <TabsTrigger value="paid-students" className="h-10">
            유료수강생
          </TabsTrigger>
          <TabsTrigger value="costs" className="h-10">
            비용
          </TabsTrigger>
          <TabsTrigger value="settlement" className="h-10">
            정산
          </TabsTrigger>
        </TabsList>
        {activeTab === "orders" || activeTab === "paid-students" ? (
          <StudentSettlementReset key={activeTab} courseId={courseId} courseName={courseName}
            target={activeTab} disabled={refreshing} onReset={handleReset} />
        ) : null}
      </div>

      {resetNotice ? <p role="status" className="text-sm">{resetNotice}</p> : null}

      <TabsContent value="orders" className="mt-0">
        <CourseOrdersManager
          key={ordersRevision}
          courseId={courseId}
          courseName={courseName}
          onCourseNameChange={setCourseName}
          onRosterSaved={() => setActiveTab("paid-students")}
        />
      </TabsContent>
      <TabsContent value="paid-students" className="mt-0">
        {refreshing ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">유료수강생 명단을 새로고침하는 중입니다.</p> : paidRoster}
      </TabsContent>
      <TabsContent value="costs" className="mt-0">
        <CourseCostManager courseId={courseId} />
      </TabsContent>
      <TabsContent value="settlement" className="mt-0">
        <CourseSettlementManager
          courseId={courseId}
          courseName={courseName}
          instructorName={instructorName}
        />
      </TabsContent>
    </Tabs>
  );
}
