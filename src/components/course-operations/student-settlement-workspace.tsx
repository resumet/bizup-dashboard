"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { CourseCostManager } from "@/components/course-costs/course-cost-manager";
import { CourseOrdersManager } from "@/components/course-operations/course-orders-manager";
import { CourseSettlementManager } from "@/components/course-settlements/course-settlement-manager";
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

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as StudentSettlementTab)}
      className="gap-6"
    >
      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-4">
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

      <TabsContent value="orders" className="mt-0">
        <CourseOrdersManager
          courseId={courseId}
          courseName={courseName}
          onCourseNameChange={setCourseName}
          onRosterSaved={() => setActiveTab("paid-students")}
        />
      </TabsContent>
      <TabsContent value="paid-students" className="mt-0">
        {paidRoster}
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
