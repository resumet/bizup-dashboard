import {
  finalizeBusinessTripFileSchema,
  prepareBusinessTripFileSchema,
} from "@/lib/business-trip-reports/model";
import {
  assertBusinessTripReportOrigin,
  businessTripReportDownloadUrl,
  businessTripReportResponseError,
  finalizeBusinessTripReportUpload,
  prepareBusinessTripReportUpload,
  requireBusinessTripReportContext,
} from "@/lib/business-trip-reports/server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext<"/api/business-trip-reports/[reportId]/file">) {
  try {
    const { reportId } = await context.params;
    const url = await businessTripReportDownloadUrl(await requireBusinessTripReportContext(), reportId);
    return Response.redirect(url, 302);
  } catch (error) {
    return businessTripReportResponseError(error);
  }
}

export async function POST(request: Request, context: RouteContext<"/api/business-trip-reports/[reportId]/file">) {
  try {
    assertBusinessTripReportOrigin(request);
    const { reportId } = await context.params;
    const input = prepareBusinessTripFileSchema.parse(await request.json());
    const upload = await prepareBusinessTripReportUpload(await requireBusinessTripReportContext(), reportId, input);
    return Response.json(upload, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessTripReportResponseError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/business-trip-reports/[reportId]/file">) {
  try {
    assertBusinessTripReportOrigin(request);
    const { reportId } = await context.params;
    const input = finalizeBusinessTripFileSchema.parse(await request.json());
    const report = await finalizeBusinessTripReportUpload(await requireBusinessTripReportContext(), reportId, input);
    return Response.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessTripReportResponseError(error);
  }
}
