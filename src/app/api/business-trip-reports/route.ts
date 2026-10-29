import { saveBusinessTripReportSchema } from "@/lib/business-trip-reports/model";
import {
  assertBusinessTripReportOrigin,
  businessTripReportResponseError,
  createBusinessTripReport,
  requireBusinessTripReportContext,
} from "@/lib/business-trip-reports/server";

export async function POST(request: Request) {
  try {
    assertBusinessTripReportOrigin(request);
    const input = saveBusinessTripReportSchema.omit({ version: true }).parse(await request.json());
    const report = await createBusinessTripReport(await requireBusinessTripReportContext(), input);
    return Response.json(report, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return businessTripReportResponseError(error);
  }
}
