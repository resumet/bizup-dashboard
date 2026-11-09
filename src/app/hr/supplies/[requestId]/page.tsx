import { notFound, redirect } from "next/navigation";

import { SupplyRequestDetail } from "@/components/hr/supply-request-detail";
import { SupplyRequestServerError, loadSupplyRequest, requireSupplyRequestContext } from "@/lib/supply-requests/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function SupplyRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  if (!UUID.test(requestId)) notFound();
  const context = await requireSupplyRequestContext().catch((error: unknown) => {
    if (error instanceof Error && error.message === "UNAUTHORIZED") redirect("/login");
    if (error instanceof Error && error.message === "PERSONNEL_INACTIVE") notFound();
    throw error;
  });
  const request = await loadSupplyRequest(context, requestId).catch((error: unknown) => {
    if (error instanceof SupplyRequestServerError && [403, 404].includes(error.status)) notFound();
    throw error;
  });
  const canEdit = request.requesterId === context.user.id && request.approvalStatus === "pending";
  const canDelete = context.isAdmin || canEdit;

  return <SupplyRequestDetail request={request} canEdit={canEdit} canDelete={canDelete} />;
}
