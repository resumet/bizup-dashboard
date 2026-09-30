import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import {
  authorizeAdPerformanceDashboard,
  loadAdPerformanceSheetState,
  parseAdPerformanceTrackingFile,
  persistAdPerformanceSheetState,
} from "@/lib/ad-performance/sheet-server";
import { adPerformanceErrorResponse } from "@/lib/ad-performance/validation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ dashboardId: string }> };

async function requestContext(dashboardId: string, userId: string) {
  const membership = await requireCourseOperationsMembership(userId);
  return authorizeAdPerformanceDashboard(
    z.uuid().parse(dashboardId),
    membership.workspace_id,
  );
}

export async function POST(request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const { dashboardId } = await params;
    const [context, formData] = await Promise.all([
      requestContext(dashboardId, user.id),
      request.formData(),
    ]);
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("추가할 엑셀 파일을 선택해 주세요.");
    }
    const current = await loadAdPerformanceSheetState(
      context.dashboardId,
      context.startDate,
    );
    if (!current) throw new Error("원본 시트를 먼저 연결해 주세요.");
    const tracking = await parseAdPerformanceTrackingFile(file);
    const saved = await persistAdPerformanceSheetState({
      context,
      actorId: user.id,
      expectedVersion: current.version,
      state: {
        ...current,
        trackingFileName: file.name.replace(/[\\/]/gu, "").slice(0, 255),
        tracking,
      },
    });
    return Response.json({ saved: true, ...saved });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const { dashboardId } = await params;
    const context = await requestContext(dashboardId, user.id);
    const current = await loadAdPerformanceSheetState(
      context.dashboardId,
      context.startDate,
    );
    if (!current) throw new Error("원본 시트를 먼저 연결해 주세요.");
    const saved = await persistAdPerformanceSheetState({
      context,
      actorId: user.id,
      expectedVersion: current.version,
      state: {
        ...current,
        trackingFileName: null,
        tracking: null,
      },
    });
    return Response.json({ saved: true, ...saved });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
