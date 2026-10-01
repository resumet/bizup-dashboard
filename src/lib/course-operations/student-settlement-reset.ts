import { z } from "zod";

export const studentSettlementResetSchema = z.strictObject({
  target: z.enum(["orders", "paid-students"]),
  confirmation: z.string().max(200).trim().min(1),
});

export type StudentSettlementResetTarget = z.infer<
  typeof studentSettlementResetSchema
>["target"];

export type StudentSettlementResetResult = {
  target: StudentSettlementResetTarget;
  resetCount: number;
  jobId: string | null;
  previousVersion: number | null;
  version: number | null;
};
