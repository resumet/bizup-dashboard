import { z } from "zod";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import { authorizeFreeStudents } from "@/lib/free-students/server";
import { syncFreeStudents } from "@/lib/free-students/sync";
import { trackingFromApplicants } from "@/lib/ad-performance/applicant-tracking";
import { authorizeAdPerformanceDashboard, loadAdPerformanceSheetState, loadGoogleWorkbook, persistAdPerformanceSheetState, removeAdPerformanceTrackingFile } from "@/lib/ad-performance/sheet-server";
import { applyTrackingToSheet } from "@/lib/ad-performance/sheet-update";
import { createSheetUpdatePreview, sheetUpdateReviewResponse } from "@/lib/ad-performance/sheet-update-review";
import { adPerformanceErrorResponse } from "@/lib/ad-performance/validation";
import { refreshCreativeData } from "@/lib/ad-creative/refresh";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request, { params }: { params: Promise<{ dashboardId: string }> }) {
  try {
    const user = await requireCourseOperationsUser(await createClient());
    const membership = await requireCourseOperationsMembership(user.id);
    const { dashboardId } = await params;
    const context = await authorizeAdPerformanceDashboard(z.uuid().parse(dashboardId), membership.workspace_id);
    if (context.serviceScope !== "bizup") throw new Error("무료 신청자 명단 업데이트는 비즈업 강의에서 사용할 수 있습니다.");
    const input = z.object({ action: z.enum(["preview", "confirm"]), version: z.number().optional(), fingerprint: z.string().optional() }).parse(await request.json());
    const admin = createAdminClient();
    const dashboard = await admin.from("ad_performance_dashboards").select("course_id").eq("id", dashboardId).eq("workspace_id", membership.workspace_id).single();
    if (dashboard.error || !dashboard.data.course_id) throw new Error("광고 사전설정에서 강의를 먼저 연결해 주세요.");
    const courseContext = await authorizeFreeStudents(dashboard.data.course_id);
    if (courseContext.course.workspace_id !== membership.workspace_id) throw new Error("연결된 강의에 접근할 수 없습니다.");
    const current = await loadAdPerformanceSheetState(dashboardId, context.startDate);
    if (!current) throw new Error("원본 시트를 먼저 연결해 주세요.");
    const workbook = await loadGoogleWorkbook(current.spreadsheetUrl, context.startDate, current.sheetName);
    const sheet = workbook.sheets.find(item => item.name === current.sheetName);
    if (!sheet) throw new Error("연결된 시트를 원본 문서에서 찾을 수 없습니다.");
    await refreshCreativeData(membership.workspace_id, user.id);
    const applicants = await syncFreeStudents(courseContext);
    const tracking = trackingFromApplicants(applicants.rows);
    const next = applyTrackingToSheet({ ...current, spreadsheetId: workbook.spreadsheetId, sourceRows: sheet.rows, trackingFileName: null }, tracking, context.startDate);
    const preview = createSheetUpdatePreview({ current, next, startDate: context.startDate, dashboardId, actorId: user.id,
      fileDigest: createHash("sha256").update(JSON.stringify({ courseId: dashboard.data.course_id, url: applicants.source_url, rows: applicants.rows })).digest("hex"),
    });
    const review = sheetUpdateReviewResponse(preview, input);
    if (review) return review;
    const latest = await admin.from("ad_performance_dashboards").select("course_id,start_date").eq("id", dashboardId).eq("workspace_id", membership.workspace_id).single();
    if (latest.error || latest.data.course_id !== dashboard.data.course_id || latest.data.start_date !== context.startDate) throw new Error("강의 연결 또는 시작일이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
    const saved = await persistAdPerformanceSheetState({ context, actorId: user.id, expectedVersion: current.version, state: next });
    if (current.tracking?.sourceStoragePath) await removeAdPerformanceTrackingFile(current.tracking.sourceStoragePath);
    return Response.json({ saved: true, ...saved }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adPerformanceErrorResponse(error); }
}
