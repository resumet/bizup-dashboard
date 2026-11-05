import { createInstructorContractSchema } from "@/lib/contracts/instructor-contract-validation";
import {
  assertInstructorContractOrigin,
  createInstructorContract,
  instructorContractResponseError,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

export async function POST(request: Request) {
  try {
    assertInstructorContractOrigin(request);
    const input = createInstructorContractSchema.parse(await request.json());
    const contract = await createInstructorContract(
      await requireInstructorContractContext(),
      input.templateId,
      input.values,
    );
    return Response.json(contract, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}
