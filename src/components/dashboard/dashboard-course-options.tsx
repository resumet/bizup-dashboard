"use client";
import { CourseManagementMenu } from "@/components/course-operations/course-management-menu";
export function DashboardCourseOptions({ courseId }: { courseId: string }) {
  return <CourseManagementMenu courseId={courseId} align="start" />;
}
