import { saveInstructorContractTemplateSchema } from "@/lib/contracts/instructor-contract-validation";
import {
  assertInstructorContractOrigin,
  createInstructorContractTemplate,
  instructorContractResponseError,
  requireInstructorContractContext,
} from "@/lib/contracts/instructor-contract-template-server";

export async function POST(request: Request) {
  try {
    assertInstructorContractOrigin(request);
    const input = saveInstructorContractTemplateSchema.parse(await request.json());
    const template = await createInstructorContractTemplate(await requireInstructorContractContext(), input);
    return Response.json({ template }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}
