import {
  assertInstructorContractOrigin,
  createInstructorContractPublicLink,
  instructorContractResponseError,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

export async function POST(request: Request, context: { params: Promise<{ contractId: string }> }) {
  try {
    assertInstructorContractOrigin(request);
    const { contractId } = await context.params;
    const token = await createInstructorContractPublicLink(await requireInstructorContractContext(), contractId);
    const origin = new URL(request.url).origin;
    return Response.json({ url: `${origin}/public/contracts/${token}` }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}
