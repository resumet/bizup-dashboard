import { SupplyRequestConflictError, supplyRequestCommandSchema } from "@/lib/supply-requests/model";
import {
  requireSupplyRequestContext,
  SupplyRequestServerError,
  updateSupplyRequest,
} from "@/lib/supply-requests/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    const { requestId } = await context.params;
    if (!UUID.test(requestId)) {
      return Response.json({ message: "비품 신청 내역을 확인해 주세요." }, { status: 400 });
    }
    const body: unknown = await request.json();
    const parsed = supplyRequestCommandSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ message: "변경할 상태를 확인해 주세요." }, { status: 400 });
    }
    const supplyContext = await requireSupplyRequestContext();
    const supplyRequest = await updateSupplyRequest(supplyContext, requestId, parsed.data);
    return Response.json(supplyRequest);
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED"
      ? 401
      : error instanceof Error && error.message === "PERSONNEL_INACTIVE"
        ? 403
        : error instanceof SupplyRequestServerError
      ? error.status
      : error instanceof SupplyRequestConflictError
        ? 409
        : error instanceof SyntaxError
          ? 400
          : 500;
    const message = error instanceof Error && error.message === "UNAUTHORIZED"
      ? "로그인이 필요합니다."
      : error instanceof Error && error.message === "PERSONNEL_INACTIVE"
        ? "활성 임직원만 비품 신청 상태를 변경할 수 있습니다."
        : error instanceof Error
          ? error.message
          : "비품 신청 상태를 변경하지 못했습니다.";
    return Response.json({ message }, { status });
  }
}
