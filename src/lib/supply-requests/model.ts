import { z } from "zod";

import type { SupplyApprovalStatus, SupplyRequestCommand } from "./types";

export const createSupplyRequestSchema = z.object({
  itemName: z.string().trim().min(1).max(120),
  priceKrw: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  purpose: z.string().trim().min(1).max(1000),
  note: z.string().trim().max(2000).default(""),
}).strict();

export const supplyRequestCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approval"),
    status: z.enum(["pending", "approved", "rejected"]),
    version: z.number().int().positive(),
  }).strict(),
  z.object({
    action: z.literal("purchase"),
    purchased: z.boolean(),
    version: z.number().int().positive(),
  }).strict(),
]);

export type SupplyRequestState = {
  approvalStatus: SupplyApprovalStatus;
  purchased: boolean;
  version: number;
};

export type SupplyRequestUpdate = {
  approval_status?: SupplyApprovalStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  purchased?: boolean;
  purchased_by?: string | null;
  purchased_at?: string | null;
  version: number;
  updated_at: string;
};

export class SupplyRequestConflictError extends Error {}

export function buildSupplyRequestUpdate(
  current: SupplyRequestState,
  command: SupplyRequestCommand,
  actorId: string,
  now: string,
): SupplyRequestUpdate {
  if (command.action === "approval") {
    if (current.purchased && command.status !== "approved") {
      throw new SupplyRequestConflictError("구매 완료된 비품은 승인 상태를 변경할 수 없습니다.");
    }
    return {
      approval_status: command.status,
      reviewed_by: command.status === "pending" ? null : actorId,
      reviewed_at: command.status === "pending" ? null : now,
      version: current.version + 1,
      updated_at: now,
    };
  }

  if (command.purchased && current.approvalStatus !== "approved") {
    throw new SupplyRequestConflictError("승인된 비품만 구매 완료로 변경할 수 있습니다.");
  }
  return {
    purchased: command.purchased,
    purchased_by: command.purchased ? actorId : null,
    purchased_at: command.purchased ? now : null,
    version: current.version + 1,
    updated_at: now,
  };
}
