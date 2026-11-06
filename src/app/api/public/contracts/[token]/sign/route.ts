import { signPublicInstructorContractSchema } from "@/lib/contracts/instructor-contract-validation";
import { assertInstructorContractOrigin, instructorContractResponseError, signPublicInstructorContract } from "@/lib/contracts/instructor-contract-template-server";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    assertInstructorContractOrigin(request);
    const { token } = await context.params;
    const contract = await signPublicInstructorContract(token, signPublicInstructorContractSchema.parse(await request.json()), request);
    return Response.json({ signingStatus: contract.signingStatus, signedAt: contract.signedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}
