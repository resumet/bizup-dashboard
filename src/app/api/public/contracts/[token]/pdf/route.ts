import { createSignedInstructorContractPdf, instructorContractPdfFilename } from "@/lib/contracts/instructor-contract-pdf";
import { instructorContractResponseError, loadPublicInstructorContract } from "@/lib/contracts/instructor-contract-template-server";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const contract = await loadPublicInstructorContract(token);
    const bytes = await createSignedInstructorContractPdf(contract);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(instructorContractPdfFilename(contract))}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}
