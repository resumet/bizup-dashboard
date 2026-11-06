import { saveInstructorContractDraft } from "@/lib/contracts/instructor-contract-draft-server";
import { instructorContractValuesSchema } from "@/lib/contracts/instructor-contract-validation";
import {
  assertInstructorContractOrigin,
  instructorContractResponseError,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

export async function PUT(request: Request) {
  try {
    assertInstructorContractOrigin(request);
    const values = instructorContractValuesSchema.parse(await request.json());
    const context = await requireInstructorContractContext();
    const updatedAt = await saveInstructorContractDraft(context.workspaceId, context.user.id, values);
    return Response.json({ updatedAt }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}
