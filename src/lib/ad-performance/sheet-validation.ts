import { z } from "zod";

import { dateValue } from "./validation";

export const sourcePreviewSchema = z.object({
  url: z.string().trim().min(1, "Google Sheets URL을 입력해 주세요.").max(2048),
});

export const sourceConnectionSchema = sourcePreviewSchema.extend({
  sheetName: z.string().trim().min(1, "시트를 선택해 주세요.").max(200),
});

export const sharedSourcePreviewSchema = z.object({ source: z.literal("workspace") });
export const sharedSourceConnectionSchema = sharedSourcePreviewSchema.extend({
  sheetName: sourceConnectionSchema.shape.sheetName,
  spreadsheetId: z.string().min(1).max(200),
  expectedVersion: z.number().int().nonnegative(),
});

const nullableCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable();

export const sheetManualInputSchema = z.object({
  metricDate: dateValue,
  chatMembersCumulative: nullableCount,
});
