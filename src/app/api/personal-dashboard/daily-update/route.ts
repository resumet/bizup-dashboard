import { z } from "zod";

import { trackingFromApplicants } from "@/lib/ad-performance/applicant-tracking";
import { authorizeAdPerformanceDashboard, loadAdPerformanceSheetState, loadGoogleWorkbook, persistAdPerformanceSheetState, removeAdPerformanceTrackingFile } from "@/lib/ad-performance/sheet-server";
import { applyTrackingToSheet } from "@/lib/ad-performance/sheet-update";
import { authorizeFreeStudents } from "@/lib/free-students/server";
import { syncFreeStudents } from "@/lib/free-students/sync";
import { requireWorkTaskContext } from "@/lib/work-tasks/server";

export const runtime = "nodejs";
export const maxDuration = 180;

type OngoingCourse = { id: string; name: string; instructor_name: string };

async function requireDailyUpdateContext() {
  const context = await requireWorkTaskContext();
  if (!context.isSuperAdmin) throw new Error("FORBIDDEN");
  return context;
}

async function loadOngoingCourses(context: Awaited<ReturnType<typeof requireDailyUpdateContext>>) {
  const { data, error } = await context.admin
    .from("courses")
    .select("id,name,instructor_name")
    .eq("workspace_id", context.workspaceId)
    .eq("status", "ongoing")
    .order("free_webinar_at", { ascending: true, nullsFirst: false })
    .order("id");
  if (error) throw new Error("진행 중인 강의를 불러오지 못했습니다.");
  return (data ?? []) as OngoingCourse[];
}

async function syncAdPerformance(input: { dashboardId: string; workspaceId: string; userId: string; applicants: Awaited<ReturnType<typeof syncFreeStudents>> }) {
  const context = await authorizeAdPerformanceDashboard(input.dashboardId, input.workspaceId);
  const current = await loadAdPerformanceSheetState(input.dashboardId, context.startDate);
  if (!current) throw new Error("광고 성과 원본 시트를 먼저 연결해 주세요.");
  const workbook = await loadGoogleWorkbook(current.spreadsheetUrl, context.startDate);
  const sheet = workbook.sheets.find((item) => item.name === current.sheetName);
  if (!sheet) throw new Error("연결한 광고 성과 시트를 원본 문서에서 찾을 수 없습니다.");
  const next = applyTrackingToSheet(
    { ...current, spreadsheetId: workbook.spreadsheetId, sourceRows: sheet.rows, trackingFileName: null },
    trackingFromApplicants(input.applicants.rows),
    context.startDate,
  );
  const saved = await persistAdPerformanceSheetState({ context, actorId: input.userId, expectedVersion: current.version, state: next });
  if (current.tracking?.sourceStoragePath) await removeAdPerformanceTrackingFile(current.tracking.sourceStoragePath);
  return { status: "updated" as const, metricCount: saved.metricCount };
}

export async function GET() {
  try {
    const context = await requireDailyUpdateContext();
    return Response.json({ courses: await loadOngoingCourses(context) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400;
    return Response.json({ message: status === 403 ? "최고관리자만 실행할 수 있습니다." : "업데이트 대상을 불러오지 못했습니다." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireDailyUpdateContext();
    const { courseId } = z.object({ courseId: z.uuid() }).parse(await request.json());
    const course = (await loadOngoingCourses(context)).find((item) => item.id === courseId);
    if (!course) throw new Error("NOT_FOUND");
    const freeStudents = await syncFreeStudents(await authorizeFreeStudents(courseId));
    const dashboard = await context.admin.from("ad_performance_dashboards").select("id")
      .eq("workspace_id", context.workspaceId).eq("course_id", courseId).eq("service_scope", "bizup").maybeSingle();
    if (dashboard.error) throw new Error("광고 성과 설정을 불러오지 못했습니다.");
    const adPerformance = dashboard.data
      ? await syncAdPerformance({ dashboardId: dashboard.data.id as string, workspaceId: context.workspaceId, userId: context.user.id, applicants: freeStudents })
      : { status: "skipped" as const };
    return Response.json({ course, freeStudents: { count: freeStudents.rows.length }, adPerformance }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "업데이트하지 못했습니다.";
    const status = message === "FORBIDDEN" ? 403 : message === "NOT_FOUND" ? 404 : 400;
    return Response.json({ message: status === 403 ? "최고관리자만 실행할 수 있습니다." : status === 404 ? "진행 중인 강의를 찾을 수 없습니다." : message }, { status });
  }
}
