import { externalMarketingExportFilename, buildExternalMarketingXlsx } from "@/lib/external-marketing/exports";
import { loadPublicExternalMarketingReport } from "@/lib/external-marketing/server";

export const runtime = "nodejs";
type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { token } = await params;
  const report = await loadPublicExternalMarketingReport(token);
  if (!report) return Response.json({ message: "공개되지 않았거나 만료된 주소입니다." }, { status: 404 });
  const buffer = await buildExternalMarketingXlsx(report.project, report.dashboard);
  const filename = externalMarketingExportFilename(report.project, "xlsx");
  return new Response(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  } });
}
