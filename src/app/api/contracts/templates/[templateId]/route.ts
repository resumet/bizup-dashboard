import { saveInstructorContractTemplateSchema } from "@/lib/contracts/instructor-contract-validation";
import {
  assertInstructorContractOrigin,
  deleteInstructorContractTemplate,
  instructorContractResponseError,
  requireInstructorContractContext,
  updateInstructorContractTemplate,
} from "@/lib/contracts/instructor-contract-template-server";

type Context = { params: Promise<{ templateId: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    assertInstructorContractOrigin(request);
    const [{ templateId }, input, contractContext] = await Promise.all([
      context.params,
      request.json().then((body) => saveInstructorContractTemplateSchema.parse(body)),
      requireInstructorContractContext(),
    ]);
    const template = await updateInstructorContractTemplate(contractContext, templateId, input);
    return Response.json({ template }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertInstructorContractOrigin(request);
    const [{ templateId }, contractContext] = await Promise.all([
      context.params,
      requireInstructorContractContext(),
    ]);
    await deleteInstructorContractTemplate(contractContext, templateId);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return instructorContractResponseError(error);
  }
}
