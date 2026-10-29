import { z } from "zod";
import { BUSINESS_TRIP_REPORT_MAX_BYTES } from "./file";

export const saveBusinessTripReportSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(200),
  finalCost: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  paymentCompleted: z.boolean(),
  version: z.number().int().positive().optional(),
}).strict();

export const prepareBusinessTripFileSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().max(BUSINESS_TRIP_REPORT_MAX_BYTES),
  mimeType: z.string().trim().min(1),
}).strict();

export const finalizeBusinessTripFileSchema = prepareBusinessTripFileSchema.extend({
  path: z.string().trim().min(1).max(1000),
  version: z.number().int().positive(),
}).strict();

export const deleteBusinessTripReportSchema = z.object({
  version: z.number().int().positive(),
}).strict();

export function canManageBusinessTripReport(
  actorId: string,
  authorId: string | null,
  isSuperAdmin: boolean,
) {
  return isSuperAdmin || authorId === actorId;
}
