import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadWorkspacePeople, requireWorkTaskContext } from "@/lib/work-tasks/server";
import type { AuthenticatedUser } from "@/lib/supabase/auth";
import { buildSupplyRequestUpdate } from "./model";
import type { SupplyRequest, SupplyRequestCommand } from "./types";

type SupplyRequestContext = Awaited<ReturnType<typeof requireWorkTaskContext>>;

type SupplyRequestRow = {
  id: string;
  requester_id: string | null;
  requester_name: string;
  item_name: string;
  price_krw: number | string;
  purpose: string;
  note: string;
  approval_status: SupplyRequest["approvalStatus"];
  reviewed_at: string | null;
  purchased: boolean;
  purchased_at: string | null;
  version: number;
  requested_at: string;
  updated_at: string;
};

export class SupplyRequestServerError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function databaseError(message: string) {
  if (/could not find[^\n]*supply_requests|relation[^\n]*supply_requests[^\n]*does not exist|PGRST20[045]|42P01/i.test(message)) {
    return new SupplyRequestServerError(
      "비품 신청 데이터베이스 마이그레이션을 먼저 적용해 주세요.",
      503,
    );
  }
  return new SupplyRequestServerError(message, 400);
}

function normalizeSupplyRequest(row: SupplyRequestRow): SupplyRequest {
  return {
    id: row.id,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    itemName: row.item_name,
    priceKrw: Number(row.price_krw),
    purpose: row.purpose,
    note: row.note,
    approvalStatus: row.approval_status,
    reviewedAt: row.reviewed_at,
    purchased: row.purchased,
    purchasedAt: row.purchased_at,
    version: row.version,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
  };
}

async function requesterName(user: AuthenticatedUser, workspaceId: string) {
  if (user.displayName) return user.displayName;
  const people = await loadWorkspacePeople(workspaceId, true);
  return people.find((person) => person.id === user.id)?.name ?? "사용자";
}

async function audit(
  admin: SupabaseClient,
  workspaceId: string,
  actorId: string,
  eventType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await admin.from("audit_logs").insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    event_type: eventType,
    entity_type: "supply_request",
    entity_id: entityId,
    metadata,
  });
  if (error) console.error("비품 신청 감사 로그 저장 실패", error.message);
}

export async function requireSupplyRequestContext() {
  return requireWorkTaskContext();
}

export async function loadSupplyRequests(
  context: Pick<SupplyRequestContext, "admin" | "workspaceId">,
) {
  const requests: SupplyRequest[] = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await context.admin
      .from("supply_requests")
      .select("id,requester_id,requester_name,item_name,price_krw,purpose,note,approval_status,reviewed_at,purchased,purchased_at,version,requested_at,updated_at")
      .eq("workspace_id", context.workspaceId)
      .order("requested_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw databaseError(error.message);
    const rows = (data ?? []) as SupplyRequestRow[];
    requests.push(...rows.map(normalizeSupplyRequest));
    if (rows.length < pageSize) break;
  }

  return requests;
}

export async function createSupplyRequest(
  context: SupplyRequestContext,
  input: { itemName: string; priceKrw: number; purpose: string; note: string },
) {
  const name = await requesterName(context.user, context.workspaceId);
  const { data, error } = await context.admin
    .from("supply_requests")
    .insert({
      workspace_id: context.workspaceId,
      requester_id: context.user.id,
      requester_name: name,
      item_name: input.itemName,
      price_krw: input.priceKrw,
      purpose: input.purpose,
      note: input.note,
    })
    .select("id,requester_id,requester_name,item_name,price_krw,purpose,note,approval_status,reviewed_at,purchased,purchased_at,version,requested_at,updated_at")
    .single();
  if (error) throw databaseError(error.message);
  const request = normalizeSupplyRequest(data as SupplyRequestRow);
  await audit(context.admin, context.workspaceId, context.user.id, "supply_request.created", request.id, {
    itemName: request.itemName,
    priceKrw: request.priceKrw,
  });
  return request;
}

export async function updateSupplyRequest(
  context: SupplyRequestContext,
  requestId: string,
  command: SupplyRequestCommand,
) {
  if (!context.isAdmin) {
    throw new SupplyRequestServerError("관리자만 승인 및 구매 상태를 변경할 수 있습니다.", 403);
  }
  const { data: current, error: findError } = await context.admin
    .from("supply_requests")
    .select("approval_status,purchased,version")
    .eq("workspace_id", context.workspaceId)
    .eq("id", requestId)
    .maybeSingle();
  if (findError) throw databaseError(findError.message);
  if (!current) throw new SupplyRequestServerError("비품 신청 내역을 찾을 수 없습니다.", 404);
  if (current.version !== command.version) {
    throw new SupplyRequestServerError("다른 변경이 먼저 저장되었습니다. 화면을 새로고침해 주세요.", 409);
  }

  const now = new Date().toISOString();
  const update = buildSupplyRequestUpdate({
    approvalStatus: current.approval_status,
    purchased: current.purchased,
    version: current.version,
  }, command, context.user.id, now);
  const { data, error } = await context.admin
    .from("supply_requests")
    .update(update)
    .eq("workspace_id", context.workspaceId)
    .eq("id", requestId)
    .eq("version", command.version)
    .select("id,requester_id,requester_name,item_name,price_krw,purpose,note,approval_status,reviewed_at,purchased,purchased_at,version,requested_at,updated_at")
    .maybeSingle();
  if (error) throw databaseError(error.message);
  if (!data) throw new SupplyRequestServerError("다른 변경이 먼저 저장되었습니다. 화면을 새로고침해 주세요.", 409);

  const request = normalizeSupplyRequest(data as SupplyRequestRow);
  await audit(context.admin, context.workspaceId, context.user.id, `supply_request.${command.action}_updated`, request.id, {
    approvalStatus: request.approvalStatus,
    purchased: request.purchased,
  });
  return request;
}
