import { createSupplyRequestSchema } from "@/lib/supply-requests/model";
import {
  createSupplyRequest,
  requireSupplyRequestContext,
  SupplyRequestServerError,
} from "@/lib/supply-requests/server";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = createSupplyRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { message: "비품 이름, 가격, 신청 목적과 비고를 확인해 주세요." },
        { status: 400 },
      );
    }
    const context = await requireSupplyRequestContext();
    const supplyRequest = await createSupplyRequest(context, parsed.data);
    return Response.json(supplyRequest, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED"
      ? 401
      : error instanceof Error && error.message === "PERSONNEL_INACTIVE"
        ? 403
        : error instanceof SupplyRequestServerError
      ? error.status
      : error instanceof SyntaxError
        ? 400
        : 500;
    const message = error instanceof Error && error.message === "UNAUTHORIZED"
      ? "로그인이 필요합니다."
      : error instanceof Error && error.message === "PERSONNEL_INACTIVE"
        ? "활성 임직원만 비품을 신청할 수 있습니다."
        : error instanceof Error
          ? error.message
          : "비품을 신청하지 못했습니다.";
    return Response.json({ message }, { status });
  }
}
