import {
  deleteBusinessTripReportSchema,
  saveBusinessTripReportSchema,
} from "@/lib/business-trip-reports/model";
import {
  assertBusinessTripReportOrigin,
  businessTripReportResponseError,
  deleteBusinessTripReport,
  requireBusinessTripReportContext,
  updateBusinessTripReport,
} from "@/lib/business-trip-reports/server";

export async function PATCH(request: Request, context: RouteContext<"/api/business-trip-reports/[reportId]">) {
  try {
    assertBusinessTripReportOrigin(request);
    const { reportId } = await context.params;
    const input = saveBusinessTripReportSchema.required({ version: true }).parse(await request.json());
    const report = await updateBusinessTripReport(await requireBusinessTripReportContext(), reportId, input);
    return Response.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessTripReportResponseError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext<"/api/business-trip-reports/[reportId]">) {
  try {
    assertBusinessTripReportOrigin(request);
    const { reportId } = await context.params;
    const input = deleteBusinessTripReportSchema.parse(await request.json());
    await deleteBusinessTripReport(await requireBusinessTripReportContext(), reportId, input.version);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessTripReportResponseError(error);
  }
}
