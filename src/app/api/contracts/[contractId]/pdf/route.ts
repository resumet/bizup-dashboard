import { createInstructorContractPdf, instructorContractPdfFilename } from "@/lib/contracts/instructor-contract-pdf";
import {
  instructorContractResponseError,
  loadInstructorContract,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contractId: string }> },
) {
  try {
    const { contractId } = await params;
    const contract = await loadInstructorContract(await requireInstructorContractContext(), contractId);
    const pdf = await createInstructorContractPdf(contract);

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(instructorContractPdfFilename(contract)),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}

