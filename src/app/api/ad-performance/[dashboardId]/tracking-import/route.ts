import { z } from "zod";

import { requireCourseOperationsMembership, requireCourseOperationsUser } from "@/lib/course-operations/server";
import {
  authorizeAdPerformanceDashboard,
  downloadAdPerformanceTrackingFile,
  loadAdPerformanceSheetState,
  loadAdPerformanceSheetSyncState,
  parseAdPerformanceTrackingFile,
  persistAdPerformanceSheetState,
  removeAdPerformanceTrackingFile,
  storeAdPerformanceTrackingFile,
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

export async function GET(request: Request, { params }: Context) {
  try {
    const supabase = await createClient();
    const user = await requireCourseOperationsUser(supabase);
    const { dashboardId } = await params;
    const context = await requestContext(dashboardId, user.id);
    if (new URL(request.url).searchParams.get("download") === "1") {
      const current = await loadAdPerformanceSheetState(
        context.dashboardId,
        context.startDate,
      );
      const storagePath = current?.tracking?.sourceStoragePath;
      if (!current?.trackingFileName || !storagePath) {
        throw new Error("다운로드할 유입 엑셀 원본이 없습니다.");
      }
      const file = await downloadAdPerformanceTrackingFile(
        context,
        storagePath,
      );
      return new Response(await file.arrayBuffer(), {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(current.trackingFileName)}`,
          "Content-Type":
            file.type ||
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const current = await loadAdPerformanceSheetSyncState(context.dashboardId);
    return Response.json(
      {
        version: current?.version ?? 0,
        updatedAt: current?.updatedAt ?? null,
        trackingFileName: current?.trackingFileName ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
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
    const previousStoragePath = current.tracking?.sourceStoragePath ?? null;
    const sourceStoragePath = await storeAdPerformanceTrackingFile(context, file);
    let saved: Awaited<ReturnType<typeof persistAdPerformanceSheetState>>;
    try {
      saved = await persistAdPerformanceSheetState({
        context,
        actorId: user.id,
        expectedVersion: current.version,
        state: {
          ...current,
          trackingFileName: file.name.replace(/[\\/]/gu, "").slice(0, 255),
          tracking: { ...tracking, sourceStoragePath },
        },
      });
    } catch (error) {
      await removeAdPerformanceTrackingFile(sourceStoragePath);
      throw error;
    }
    if (previousStoragePath && previousStoragePath !== sourceStoragePath) {
      await removeAdPerformanceTrackingFile(previousStoragePath);
    }
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
    const previousStoragePath = current.tracking?.sourceStoragePath ?? null;
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
    await removeAdPerformanceTrackingFile(previousStoragePath);
    return Response.json({ saved: true, ...saved });
  } catch (error) {
    return adPerformanceErrorResponse(error);
  }
}
