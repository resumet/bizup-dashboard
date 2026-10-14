import { createHash } from "node:crypto";
import { compareSheetUpdates, type SheetUpdatePreview } from "./sheet-update";
import type { AdPerformanceSheetState } from "./types";

export function createSheetUpdatePreview(input: {
  current: AdPerformanceSheetState;
  next: AdPerformanceSheetState;
  startDate: string;
  dashboardId: string;
  actorId: string;
  fileDigest?: string;
}): SheetUpdatePreview {
  return {
    version: input.current.version,
    fingerprint: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    changes: compareSheetUpdates(input.current, input.next, input.startDate),
  };
}

export function sheetUpdateReviewResponse(
  preview: SheetUpdatePreview,
  input: { action: unknown; version?: unknown; fingerprint?: unknown },
) {
  if (input.action !== "confirm") return Response.json({ preview }, { headers: { "Cache-Control": "private, no-store" } });
  if (Number(input.version) !== preview.version || input.fingerprint !== preview.fingerprint) {
    return Response.json({ message: "확인 중 데이터가 변경되었습니다. 변경 내역을 다시 확인해 주세요.", preview }, { status: 409 });
  }
  return null;
}
